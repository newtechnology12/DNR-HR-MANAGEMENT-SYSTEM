'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { submitReport } from '../actions/reportActions'

export default function ReportForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    const result = await submitReport(formData)

    setIsSubmitting(false)
    if (result.success) {
      router.push('/reports')
    } else {
      alert(result.message)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input type="hidden" name="staffId" value="current-staff-id" /> {/* Replace with actual staff ID */}
      <Input name="name" placeholder="Report Name" required />
      <Select name="type" required>
        <SelectTrigger>
          <SelectValue placeholder="Report Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="daily">Daily</SelectItem>
          <SelectItem value="weekly">Weekly</SelectItem>
          <SelectItem value="monthly">Monthly</SelectItem>
          <SelectItem value="other">Other</SelectItem>
        </SelectContent>
      </Select>
      <Input type="date" name="date" required />
      <Textarea name="description" placeholder="Report Description" />
      <Input type="file" name="file" accept=".docx,.xlsx,.pdf" required />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Submitting...' : 'Submit Report'}
      </Button>
    </form>
  )
}

