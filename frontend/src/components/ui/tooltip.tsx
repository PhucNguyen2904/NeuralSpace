"use client";
import * as React from "react";
/** Storybook: Lightweight tooltip for icon actions. */
export function Tooltip({content,children}:{content:string;children:React.ReactNode}){const [v,setV]=React.useState(false);return <span className="relative inline-flex" onMouseEnter={()=>setV(true)} onMouseLeave={()=>setV(false)}>{children}{v?<span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded bg-bg-elevated px-2 py-1 text-xs shadow-panel">{content}</span>:null}</span>;}
