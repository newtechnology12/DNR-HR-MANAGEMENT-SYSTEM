export type UserRole = "employee" | "hr"

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
}
