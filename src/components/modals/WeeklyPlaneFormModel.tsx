import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader } from 'lucide-react'
import { weeklyPlanSchema, getDefaultValues } from '@/utils/weeklyPlanUtils'
import pocketbase from '@/lib/pocketbase'
import AppFormField from '../forms/AppFormField'
import AppFormSelect from '../forms/AppFormSelect'
import AppFormAsyncSelect from '../forms/AppFormAsyncSelect'
import AppFormDatePicker from '../forms/AppFormDatepicker'
import TeamMembersSelect from '@/pages/dashboard/projects/TeamMembersSelect'
import FileUploadComponent from '@/pages/dashboard/FileUploadComponent'
import ClientFormModal from './ClientsModelForm'

interface WeeklyPlanFormModalProps {
  open: boolean
  setOpen: (open: boolean) => void
  onOpenChange: (open: boolean) => void
  plan?: any
  onComplete: () => void
}

export default function WeeklyPlanFormModal({
  open,
  setOpen,
  onOpenChange,
  plan,
  onComplete,
}: WeeklyPlanFormModalProps) {
  const [activeTab, setActiveTab] = useState('details')
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false)

  const form = useForm<z.infer<typeof weeklyPlanSchema>>({
    resolver: zodResolver(weeklyPlanSchema),
    defaultValues: getDefaultValues(plan),
  })

  const { fields: keyTasksFields, append: appendKeyTask } = useFieldArray({
    control: form.control,
    name: 'key_tasks',
  })

  async function onSubmit(values: z.infer<typeof weeklyPlanSchema>) {
    try {
      const data = {
        ...values,
        engagement_contractual_deadline: values.engagement_contractual_deadline?.toISOString(),
        firm_deadline: values.firm_deadline?.toISOString(),
      }

      console.log('Submitting data:', data)

      if (plan) {
        await pocketbase.collection('weeklyPlans').update(plan.id, data)
        toast.success('Weekly Plan updated successfully')
      } else {
        await pocketbase.collection('weeklyPlans').create(data)
        toast.success('Weekly Plan created successfully')
      }

      onComplete()
      form.reset()
      setOpen(false)
    } catch (error: any) {
      console.error('Error:', error)
      if (error.data?.data?.reference_number?.message) {
        form.setError('reference_number', {
          type: 'custom',
          message: error.data.data.reference_number.message,
        })
      } else {
        toast.error('An error occurred. Please try again.')
      }
    }
  }

  const loaders = {
    serviceCategories: ({ search }: { search: string }) =>
      pocketbase
        .collection('serviceCategories')
        .getList(0, 5, { filter: search ? `name~"${search}"` : '', perPage: 5 })
        .then((e) => e.items.map((item) => ({ label: item.name, value: item.id }))),
    clients: ({ search }: { search: string }) =>
      pocketbase
        .collection('clients')
        .getList(0, 5, { filter: search ? `clientName~"${search}"` : '', perPage: 5 })
        .then((e) => e.items.map((item) => ({ label: item.clientName, value: item.id }))),
    users: ({ search }: { search: string }) =>
      pocketbase
        .collection('users')
        .getList(0, 5, { filter: search ? `name~"${search}"` : '', perPage: 5 })
        .then((e) => e.items.map((item) => ({ label: item.name, value: item.id }))),
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {plan ? 'Edit Weekly Plan' : 'Create a new Weekly Plan'}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Fill in the fields to {plan ? 'edit' : 'create'} a weekly plan.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="tasks">Team & Tasks</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <AppFormField
                    form={form}
                    name="reference_number"
                    label="Reference Number"
                    placeholder="Enter reference number"
                  />
                  <AppFormSelect
                    form={form}
                    name="service_category"
                    label="Service Category"
                    placeholder="Choose service category"
                    options={[
                      { label: 'Audit', value: 'audit' },
                      { label: 'Accounting', value: 'accounting' },
                      { label: 'Tax', value: 'tax' },
                      { label: 'Due diligence', value: 'due_diligence' },
                      { label: 'Corporate advisory', value: 'corporate_advisory' },
                      { label: 'Corporate trainings', value: 'corporate_trainings' },
                      { label: 'HR Advisory', value: 'hr_advisory' },
                      { label: 'Risk & Compliance advisory', value: 'risk_compliance_advisory' },
                      { label: 'Strategy & Innovation', value: 'strategy_innovation' },
                      { label: 'IT Advisory', value: 'it_advisory' },
                      { label: 'Business Strategy consulting & Specialized services', value: 'business_strategy_consulting_specialized_services' },
                      { label: 'Quality review', value: 'quality_review' },
                      { label: 'DNR PARTNERS-RW', value: 'dnr_partners_rw' },
                    ]}
                  />
                  <div className="flex items-center space-x-2">
                    <AppFormAsyncSelect
                      form={form}
                      name="client_name"
                      label="Client Name"
                      placeholder="Choose client name"
                      loader={loaders.clients}
                    />
                    <Button type="button" onClick={() => setIsAddClientModalOpen(true)} variant="outline">
                      Add Client
                    </Button>
                  </div>
                  <AppFormField
                    form={form}
                    name="engagement_title"
                    label="Engagement Title"
                    placeholder="Enter engagement title"
                  />
                  <AppFormDatePicker
                    form={form}
                    name="engagement_contractual_deadline"
                    label="Contractual Deadline"
                    placeholder="Select contractual deadline"
                  />
                  <AppFormDatePicker
                    form={form}
                    name="firm_deadline"
                    label="Firm Deadline"
                    placeholder="Select firm deadline"
                  />
                  <AppFormSelect
                    form={form}
                    name="engagement_status"
                    label="Engagement Status"
                    placeholder="Choose engagement status"
                    options={[
                      { label: 'Initiation (0-10%)', value: 'initiation' },
                      { label: 'In progress (11-30%)', value: 'in_progress_11_30' },
                      { label: 'In progress (31-50%)', value: 'in_progress_31_50' },
                      { label: 'In progress (51-70%)', value: 'in_progress_51_70' },
                      { label: 'In progress (71-90%)', value: 'in_progress_71_90' },
                      { label: 'Finalization- Review Process', value: 'finalization_review' },
                      { label: 'Finalization- Draft Submitted to Client', value: 'finalization_draft' },
                      { label: 'Finalization- Client Signature Process', value: 'finalization_signature' },
                      { label: 'Signed and Archive in process', value: 'signed_archive_process' },
                      { label: 'Signed and archived', value: 'signed_archived' },
                    ]}
                  />
                  <AppFormField
                    form={form}
                    name="observations"
                    label="Observations"
                    placeholder="Enter observations"
                  />
                </div>
              </TabsContent>
              <TabsContent value="tasks" className="space-y-4">
                <div className="space-y-4">
                  {keyTasksFields.map((field, index) => (
                    <div key={field.id} className="space-y-2 p-4 border rounded-md">
                      <AppFormField
                        form={form}
                        name={`key_tasks.${index}.task`}
                        label={`Key Task ${index + 1}`}
                        placeholder="Enter key task"
                      />
                      <div className="grid sm:grid-cols-2 gap-2">
                        <AppFormDatePicker
                          form={form}
                          name={`key_tasks.${index}.start_date`}
                          label="Start Date"
                          placeholder="Select start date"
                        />
                        <AppFormDatePicker
                          form={form}
                          name={`key_tasks.${index}.end_date`}
                          label="End Date"
                          placeholder="Select end date"
                        />
                      </div>
                      <TeamMembersSelect
                        form={form}
                        name={`key_tasks.${index}.team`}
                        label="Team Members"
                        placeholder="Choose team members"
                        loader={loaders.users}
                      />
                    </div>
                  ))}
                  <Button type="button" onClick={() => appendKeyTask({})} variant="outline">
                    Add New Key Task
                  </Button>
                </div>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Team</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <AppFormAsyncSelect
                      form={form}
                      name="partner"
                      label="Partner"
                      placeholder="Choose partner"
                      loader={loaders.users}
                      defaultValue={{ label: 'Default Partner', value: 'default_partner_id' }}
                    />
                    <AppFormAsyncSelect
                      form={form}
                      name="director"
                      label="Director"
                      placeholder="Choose director"
                      loader={loaders.users}
                      defaultValue={{ label: 'Default Director', value: 'default_director_id' }}
                    />
                    <AppFormAsyncSelect
                      form={form}
                      name="manager"
                      label="Manager"
                      placeholder="Choose manager"
                      loader={loaders.users}
                    />
                    <AppFormAsyncSelect
                      form={form}
                      name="team_leader"
                      label="Team Leader"
                      placeholder="Choose team leader"
                      loader={loaders.users}
                    />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="files">
                <FileUploadComponent />
              </TabsContent>
            </Tabs>
            <DialogFooter>
              <div className="flex items-center justify-end gap-2 w-full">
                <Button onClick={() => form.reset()} type="button" variant="outline">
                  Reset Form
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader className="mr-2 h-4 w-4 animate-spin" />}
                  {plan ? 'Update Weekly Plan' : 'Create Weekly Plan'}
                </Button>
                <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
                  Close
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
      <ClientFormModal open={isAddClientModalOpen} onOpenChange={setIsAddClientModalOpen} />
    </Dialog>
  )
}