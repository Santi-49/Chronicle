'use client'

import { useAuth } from '@/contexts/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

export default function SettingsPage() {
  const { user } = useAuth()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Full Name</Label>
            <Input value={user?.full_name || ''} disabled />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Email</Label>
            <Input value={user?.email || ''} disabled />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Roles</Label>
            <div className="flex flex-wrap gap-2">
              {user?.roles.map((role) => (
                <Badge key={role.id} variant="secondary">
                  {role.name}
                </Badge>
              )) || <span className="text-sm text-muted-foreground">No roles assigned</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground">Additional settings content goes here</p>
      </div>
    </div>
  )
}
