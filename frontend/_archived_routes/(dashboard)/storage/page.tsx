import { Card, CardContent, CardHeader, SkeletonTable } from "@/components/ui";
export default function StoragePage(){return <Card><CardHeader><h1 className="text-xl">Notebook Storage</h1></CardHeader><CardContent><SkeletonTable rows={6}/></CardContent></Card>;}
