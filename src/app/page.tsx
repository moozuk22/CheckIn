import Link from 'next/link'
import { InstallAppButton } from '@/components/pwa/InstallAppButton'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-8">Welcome to Dalida Check-in</h1>
      <div className="flex gap-4">
        <InstallAppButton />
        <Link href="/admin/login" className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
          Admin Login
        </Link>
      </div>
    </main>
  )
}
