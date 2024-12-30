"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Hash, Star, History, ChevronDown, Plus, Bell, Search, Users, Link, Smile, Paperclip, Mic, Send } from 'lucide-react'

export default function Component() {
  const [message, setMessage] = useState("")

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar */}
      <div className="w-64 border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-semibold">Discuss</h1>
          </div>
          <Button className="w-full" variant="secondary">
            Start a meeting
          </Button>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="p-2">
            <nav className="space-y-2">
              <Button variant="ghost" className="w-full justify-start">
                <Star className="mr-2 h-4 w-4" />
                Starred
              </Button>
              <Button variant="ghost" className="w-full justify-start">
                <History className="mr-2 h-4 w-4" />
                History
              </Button>
            </nav>

            <div className="mt-6">
              <div className="flex items-center justify-between px-2 mb-2">
                <h2 className="text-sm font-semibold">CHANNELS</h2>
                <Button variant="ghost" size="icon" className="h-4 w-4">
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <nav className="space-y-1">
                <Button variant="ghost" className="w-full justify-start">
                  <Hash className="mr-2 h-4 w-4" />
                  Buffalo Office
                </Button>
                <Button variant="ghost" className="w-full justify-start">
                  <Hash className="mr-2 h-4 w-4" />
                  general
                </Button>
              </nav>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between px-2 mb-2">
                <h2 className="text-sm font-semibold">DIRECT MESSAGES</h2>
                <Button variant="ghost" size="icon" className="h-4 w-4">
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <nav className="space-y-1">
                {["Laurie Poiret", "Mitchell Admin", "Marc Demo"].map((user) => (
                  <Button key={user} variant="ghost" className="w-full justify-start">
                    <Avatar className="h-4 w-4 mr-2">
                      <AvatarImage src="/placeholder.svg" />
                      <AvatarFallback>{user[0]}</AvatarFallback>
                    </Avatar>
                    {user}
                  </Button>
                ))}
              </nav>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="border-b p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h2 className="font-semibold">MRR squad</h2>
            <span className="text-muted-foreground">Monthly pipe report</span>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="icon">
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Search className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Users className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {/* Financial Stats */}
            <div className="bg-muted p-4 rounded-lg">
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-sm text-muted-foreground">MRR</div>
                  <div className="text-2xl font-bold">$1,152</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Net New</div>
                  <div className="text-2xl font-bold text-green-500">$413</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Churn</div>
                  <div className="text-2xl font-bold text-red-500">-$1,018</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Growth</div>
                  <div className="text-2xl font-bold">$609</div>
                </div>
              </div>
              {/* Placeholder for graph */}
              <div className="h-40 bg-muted-foreground/20 rounded" />
            </div>

            {/* Messages */}
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Avatar>
                  <AvatarImage src="/placeholder.svg" />
                  <AvatarFallback>MA</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold">Mitchell Admin</span>
                    <span className="text-sm text-muted-foreground">6 minutes ago</span>
                  </div>
                  <p className="text-sm bg-muted p-2 rounded-lg mt-1">
                    You&apos;re muted, Laurie 🤐
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <div className="flex items-center space-x-2">
            <Input
              placeholder="Message MRR squad..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="flex-1"
            />
            <Button variant="ghost" size="icon">
              <Smile className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Mic className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-64 border-l p-4">
        <h3 className="font-semibold mb-4">MEMBER LIST</h3>
        <Button variant="outline" className="w-full mb-4">
          Invite a User
        </Button>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">Online - 2</div>
          {["Laurie Poiret", "Mitchell Admin", "Marc Demo"].map((user) => (
            <div key={user} className="flex items-center space-x-2">
              <Avatar>
                <AvatarImage src="/placeholder.svg" />
                <AvatarFallback>{user[0]}</AvatarFallback>
              </Avatar>
              <span className="text-sm">{user}</span>
              <div className="ml-auto h-2 w-2 rounded-full bg-green-500" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}