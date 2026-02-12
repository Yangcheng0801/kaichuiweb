/**
 * 通过微信 TCB HTTP API 访问云开发数据库（用于云托管内网 SDK 不可达时）
 * TCB API 只接受「拥有该云开发环境的小程序」的 access_token，故 USE_HTTP_DB 时需配置：
 *   WX_APPID + WX_APP_SECRET（小程序 AppID/Secret，与云开发环境同主体）
 * 网站应用 WX_WEB_APPID/WX_WEB_SECRET 仅用于 Web 扫码登录，不能用于 tcb/databasequery。
 */
const axios = require('axios');
const https = require('https');

const httpsAgentInsecure = new https.Agent({ rejectUnauthorized: false });
const TOKEN_CACHE = { token: null, expireAt: 0 };
const TOKEN_BUFFER = 300; // 提前 5 分钟刷新

async function getAccessToken() {
  const now = Date.now();
  if (TOKEN_CACHE.token && TOKEN_CACHE.expireAt > now + TOKEN_BUFFER * 1000) {
    return TOKEN_CACHE.token;
  }
  // 优先使用小程序凭证（TCB API 只认拥有云开发环境的小程序）
  const appId = process.env.WX_APPID || process.env.WX_WEB_APPID;
  const secret = process.env.WX_APP_SECRET || process.env.WX_WEB_SECRET;
  const source = process.env.WX_APPID ? 'WX_APPID' : 'WX_WEB_APPID';
  if (!appId || !secret) {
    throw new Error('HTTP DB: USE_HTTP_DB 时请配置 WX_APPID + WX_APP_SECRET（小程序，拥有该云开发环境）');
  }
  console.log('[HTTP DB] 使用凭证:', source, appId.substring(0, 8) + '***');
  const res = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: { grant_type: 'client_credential', appid: appId, secret },
    timeout: 10000,
    httpsAgent: httpsAgentInsecure
  });
  if (res.data.errcode) {
    throw new Error('HTTP DB: 获取 access_token 失败 ' + (res.data.errmsg || ''));
  }
  const token = res.data.access_token;
  const expiresIn = (res.data.expires_in || 7200) * 1000;
  TOKEN_CACHE.token = token;
  TOKEN_CACHE.expireAt = now + expiresIn;
  return token;
}

async function tcbPost(apiPath, body) {
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/tcb/${apiPath}`;
  const res = await axios.post(url, body, {
    params: { access_token: token },
    timeout: 15000,
    validateStatus: () => true,
    httpsAgent: httpsAgentInsecure
  });
  const data = res.data;
  if (data.errcode && data.errcode !== 0) {
    const err = new Error(data.errmsg || 'TCB API 错误');
    err.errcode = data.errcode;
    throw err;
  }
  return data;
}

/**
 * 执行 databasequery，返回 { data: array }
 */
async function query(env, queryStr) {
  const data = await tcbPost('databasequery', { env, query: queryStr });
  const rawList = Array.isArray(data.list) ? data.list : (data.data || []);
  // TCB HTTP API 在某些情况下会返回 JSON 字符串数组，这里统一做一次 JSON.parse 兼容处理
  const list = Array.isArray(rawList)
    ? rawList.map((item) => {
        if (typeof item === 'string') {
          try {
            return JSON.parse(item);
          } catch (e) {
            console.warn('[HTTP DB] JSON.parse 失败，返回原始项：', e && e.message);
            return item;
          }
        }
        return item;
      })
    : [];
  const pager = data.pager || {};
  return { data: list, pager, count: data.count };
}

/**
 * 执行 databaseadd，返回 { _id }
 */
async function add(env, collectionName, record) {
  const queryStr = `db.collection("${collectionName}").add({ data: ${JSON.stringify(record)} })`;
  const data = await tcbPost('databaseadd', { env, query: queryStr });
  const id = data.id_list && data.id_list[0];
  if (!id) throw new Error('HTTP DB add: 未返回 id');
  return { _id: id };
}

/**
 * 执行 databaseupdate
 */
async function update(env, collectionName, docId, updateData) {
  const queryStr = `db.collection("${collectionName}").doc("${docId}").update({ data: ${JSON.stringify(updateData)} })`;
  await tcbPost('databaseupdate', { env, query: queryStr });
  return { updated: 1 };
}

/**
 * 执行 databasedelete（doc().remove()）
 */
async function remove(env, collectionName, docId) {
  const queryStr = `db.collection("${collectionName}").doc("${docId}").remove()`;
  await tcbPost('databasedelete', { env, query: queryStr });
  return { removed: 1 };
}

/**
 * 执行 databaseupdate（where().update()）
 */
async function updateWhere(env, collectionName, condStr, updateData) {
  const queryStr = `db.collection("${collectionName}").where(${condStr}).update({ data: ${JSON.stringify(updateData)} })`;
  const data = await tcbPost('databaseupdate', { env, query: queryStr });
  return { stats: { updated: data.matched || 0 } };
}

/**
 * 执行 databasedelete（where().remove()）
 */
async function removeWhere(env, collectionName, condStr) {
  const queryStr = `db.collection("${collectionName}").where(${condStr}).remove()`;
  const data = await tcbPost('databasedelete', { env, query: queryStr });
  return { stats: { removed: data.deleted || 0 } };
}

/**
 * 供 HTTP DB 使用的 command 对象（序列化为 TCB JS 表达式字符串）
 * 注：_.neq / _.gte 等在 JSON.stringify 时会变为 {} 导致查询失败。
 * 这里实现"可 JSON.stringify"的占位符，由 where() 在序列化前递归替换为 db.command.xxx 表达式字符串。
 */
const httpDbCommand = (() => {
  // 标记一个值为 db command 表达式
  const mkCmd = (expr) => ({ __httpDbCmd: true, expr });
  // 序列化值（Date → new Date(...) 表达式）
  const serVal = (v) => v instanceof Date ? `new Date(${JSON.stringify(v.toISOString())})` : JSON.stringify(v);
  return {
    neq: (v) => mkCmd(`_.neq(${serVal(v)})`),
    eq:  (v) => mkCmd(`_.eq(${serVal(v)})`),
    gt:  (v) => mkCmd(`_.gt(${serVal(v)})`),
    gte: (v) => {
      const base = mkCmd(`_.gte(${serVal(v)})`);
      base.and = (other) => mkCmd(`_.gte(${serVal(v)}).and(${other && other.__httpDbCmd ? other.expr : serVal(other)})`);
      return base;
    },
    lte: (v) => mkCmd(`_.lte(${serVal(v)})`),
    in:  (arr) => mkCmd(`_.in(${JSON.stringify(arr)})`),
    exists: (v) => mkCmd(`_.exists(${v ? 'true' : 'false'})`),
    and: (arr) => mkCmd(`_.and([${arr.map(item => serializeWhere(item)).join(',')}])`),
    or:  (arr) => mkCmd(`_.or([${arr.map(item => serializeWhere(item)).join(',')}])`),
  };
})();

/**
 * 将包含 __httpDbCmd 占位符的条件对象序列化为 TCB 查询字符串
 */
function serializeWhere(cond) {
  if (cond && cond.__httpDbCmd) return cond.expr;
  if (Array.isArray(cond)) return `[${cond.map(serializeWhere).join(',')}]`;
  if (cond && typeof cond === 'object') {
    const parts = Object.entries(cond).map(([k, v]) => {
      const vStr = (v && v.__httpDbCmd) ? v.expr : JSON.stringify(v);
      return `"${k}": ${vStr}`;
    });
    return `{${parts.join(',')}}`;
  }
  return JSON.stringify(cond);
}

/**
 * 返回兼容 SDK 的 HTTP 数据库适配器（仅实现当前业务用到的接口）
 * serverDate() 在 HTTP 模式下用 new Date() 替代
 */
function createHttpDb(env) {
  const serverDate = () => new Date();
  return {
    serverDate,
    command: httpDbCommand,
    RegExp({ regexp, options }) {
      return { __httpDbCmd: true, expr: `new db.RegExp({regexp: ${JSON.stringify(regexp)}, options: ${JSON.stringify(options || '')}})` };
    },
    collection(name) {
      return {
        async get() {
          const q = `db.collection("${name}").limit(100).get()`;
          const res = await query(env, q);
          return { data: res.data };
        },
        orderBy(field, order) {
          const dir = order === 'desc' ? 'desc' : 'asc';
          return {
            skip(s) {
              return {
                limit(n) {
                  return {
                    async get() {
                      const q = `db.collection("${name}").orderBy("${field}", "${dir}").skip(${s}).limit(${n}).get()`;
                      const res = await query(env, q);
                      return { data: res.data };
                    }
                  };
                }
              };
            },
            limit(n) {
              return {
                async get() {
                  const q = `db.collection("${name}").orderBy("${field}", "${dir}").limit(${n}).get()`;
                  const res = await query(env, q);
                  return { data: res.data };
                }
              };
            }
          };
        },
        limit(n) {
          return {
            async get() {
              const q = `db.collection("${name}").limit(${n}).get()`;
              const res = await query(env, q);
              return { data: res.data };
            }
          };
        },
        where(cond) {
          const condStr = serializeWhere(cond);
          const buildOrderBy = (orderByStrs) => {
            const orderClause = orderByStrs.length ? '.orderBy(' + orderByStrs.map(([f, o]) => `"${f}", "${o}"`).join(').orderBy(') + ')' : '';
            return {
              async count() {
                const q = `db.collection("${name}").where(${condStr})${orderClause}.count()`;
                const res = await query(env, q);
                const total = (res.pager && res.pager.total) ?? (res.count != null ? res.count : null) ?? (res.data && res.data[0] && res.data[0].total) ?? (Array.isArray(res.data) ? res.data.length : 0);
                return { total: total ?? 0 };
              },
              orderBy(field, order) {
                const dir = order === 'desc' ? 'desc' : 'asc';
                return buildOrderBy([...orderByStrs, [field, dir]]);
              },
              async get() {
                const q = `db.collection("${name}").where(${condStr})${orderClause}.limit(1000).get()`;
                const res = await query(env, q);
                return { data: res.data };
              },
              skip(s) {
                return {
                  limit(n) {
                    return {
                      async get() {
                        const q = `db.collection("${name}").where(${condStr})${orderClause}.skip(${s}).limit(${n}).get()`;
                        const res = await query(env, q);
                        return { data: res.data };
                      }
                    };
                  }
                };
              },
              limit(n) {
                return {
                  async get() {
                    const q = `db.collection("${name}").where(${condStr})${orderClause}.limit(${n}).get()`;
                    const res = await query(env, q);
                    return { data: res.data };
                  }
                };
              }
            };
          };
          return {
            async get() {
              const q = `db.collection("${name}").where(${condStr}).get()`;
              const res = await query(env, q);
              return { data: res.data };
            },
            async count() {
              const q = `db.collection("${name}").where(${condStr}).count()`;
              const res = await query(env, q);
              const total = (res.pager && res.pager.total) ?? (res.count != null ? res.count : null) ?? (res.data && res.data[0] && res.data[0].total) ?? (Array.isArray(res.data) ? res.data.length : 0);
              return { total: total ?? 0 };
            },
            async update(opts) {
              const data = opts.data || opts;
              return updateWhere(env, name, condStr, data);
            },
            async remove() {
              return removeWhere(env, name, condStr);
            },
            field(projection) {
              const fieldStr = JSON.stringify(projection);
              return {
                async get() {
                  const q = `db.collection("${name}").where(${condStr}).field(${fieldStr}).get()`;
                  const res = await query(env, q);
                  return { data: res.data };
                }
              };
            },
            orderBy(field, order) {
              const dir = order === 'desc' ? 'desc' : 'asc';
              return buildOrderBy([[field, dir]]);
            },
            skip(s) {
              return {
                limit(n) {
                  return {
                    async get() {
                      const q = `db.collection("${name}").where(${condStr}).skip(${s}).limit(${n}).get()`;
                      const res = await query(env, q);
                      return { data: res.data };
                    }
                  };
                }
              };
            },
            limit(n) {
              return {
                async get() {
                  const q = `db.collection("${name}").where(${condStr}).limit(${n}).get()`;
                  const res = await query(env, q);
                  return { data: res.data };
                }
              };
            }
          };
        },
        add(opts) {
          const data = opts.data || opts;
          return add(env, name, data);
        },
        doc(id) {
          return {
            async get() {
              const q = `db.collection("${name}").doc("${id}").get()`;
              const res = await query(env, q);
              return { data: res.data };
            },
            async update(opts) {
              const data = opts.data || opts;
              return update(env, name, id, data);
            },
            async remove() {
              return remove(env, name, id);
            }
          };
        }
      };
    }
  };
}

module.exports = {
  getAccessToken,
  query,
  add,
  update,
  remove,
  createHttpDb
};
