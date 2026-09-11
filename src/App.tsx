import ArrowRight from '@/assets/icons/arrow-right.svg?react'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { AppLayout } from '@/layouts/AppLayout'
import styles from './App.module.css'

export function App() {
  return (
    <AppLayout actions={<Button size="sm" variant="ghost">Sign in</Button>}>
      <div className={styles.page}>
        <h1 className={styles.title}>Moog</h1>
        <p className={styles.lead}>
          A single-page React + TypeScript app. Reusable components live in <code>src/components</code>,
          the shell in <code>src/layouts</code>, and SVGs in <code>src/assets</code>.
        </p>
        <div className={styles.actions}>
          <Button icon={<Icon svg={ArrowRight} size={16} />}>Get started</Button>
          <Button variant="secondary">Learn more</Button>
        </div>
      </div>
    </AppLayout>
  )
}
