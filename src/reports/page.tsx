import Link from 'next/link'
import { Button } from '@/components/ui/button'
import ReportList from '../components/ReportList'

export default function ReportsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Reports</h1>
        <Button asChild>
          <Link href="/submit-report">Submit New Report</Link>
        </Button>
      </div>
      <ReportList />
    </div>
  )
}

