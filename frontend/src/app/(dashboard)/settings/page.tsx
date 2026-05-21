import { Card, CardContent, CardHeader, Input } from "@/components/ui";
export default function SettingsPage(){return <Card className="max-w-2xl"><CardHeader><h1 className="text-xl">Settings</h1></CardHeader><CardContent className="space-y-3"><Input placeholder="Display name" defaultValue="ML Engineer"/><Input placeholder="Email" defaultValue="ml@example.com"/></CardContent></Card>;}
