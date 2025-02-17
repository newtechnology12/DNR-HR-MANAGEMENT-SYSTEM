"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import pocketbase from "@/lib/pocketbase"


export function CarRegistrationForm({ onCarRegistered }) {
  const { register, handleSubmit, reset } = useForm()
  const [isLoading, setIsLoading] = useState(false)

  const onSubmit = async (data) => {
    setIsLoading(true)
    try {
      const newCar = await pocketbase.collection("cars").create(data)
      toast.success("Car registered successfully")
      reset()
      onCarRegistered(newCar)
    } catch (error) {
      console.error("Error registering car:", error)
      toast.success("Error: " + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input {...register("registrationNumber")} placeholder="Registration Number" required />
      <Input {...register("make")} placeholder="Make" required />
      <Input {...register("model")} placeholder="Model" required />
      <Input {...register("year")} placeholder="Year" type="number" required />
      <Input {...register("currentKilometers")} placeholder="Current Kilometers" type="number" step="0.1" required />
      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Registering..." : "Register Car"}
      </Button>
    </form>
  )
}

