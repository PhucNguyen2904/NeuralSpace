"use client";
import * as React from "react";
import { cn } from "@/lib/utils/cn";
/** Storybook: Minimal dropdown menu for actions and filters. */
export function Dropdown({trigger,items}:{trigger:React.ReactNode;items:Array<{label:string;onSelect:()=>void;danger?:boolean}>}){const [open,setOpen]=React.useState(false); return <div className="relative inline-block"><button onClick={()=>setOpen((p)=>!p)}>{trigger}</button>{open?<div className="absolute right-0 z-40 mt-2 w-44 rounded-md border border-border bg-bg-elevated p-1 shadow-panel">{items.map((it)=><button key={it.label} className={cn("w-full rounded px-2 py-1.5 text-left text-sm hover:bg-bg-overlay",it.danger&&"text-error")} onClick={()=>{it.onSelect();setOpen(false);}}>{it.label}</button>)}</div>:null}</div>;}
