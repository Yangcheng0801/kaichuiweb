import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { Toaster } from 'sonner'
import { store } from '@/store'
import { ThemeProvider } from '@/contexts/ThemeContext'
import AppRouter from '@/router'

export default function App() {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <BrowserRouter>
          <AppRouter />
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </ThemeProvider>
    </Provider>
  )
}
