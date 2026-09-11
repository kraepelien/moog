import type { ReactNode } from 'react'
import Logo from '@/assets/logo.svg?react'
import { Icon } from '@/components/Icon'
import styles from './AppLayout.module.css'

type AppLayoutProps = {
  actions?: ReactNode
  children: ReactNode
}

export function AppLayout({ actions, children }: AppLayoutProps) {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={`${styles.inner} ${styles.bar}`}>
          <span className={styles.brand}>
            <Icon svg={Logo} size={24} label="Moog" />
            Moog
          </span>
          {actions}
        </div>
      </header>

      <main className={styles.main}>
        <div className={`${styles.inner} ${styles.content}`}>{children}</div>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.inner} ${styles.bar}`}>
          <span>© {new Date().getFullYear()} Moog</span>
        </div>
      </footer>
    </div>
  )
}
