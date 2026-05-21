"use client";
import { Toaster as SonnerToaster, toast as sonnerToast } from "sonner";
/** Storybook: Toast viewport bound to design token palette. */
export function Toaster(){return <SonnerToaster richColors closeButton theme="dark" toastOptions={{classNames:{toast:"!bg-bg-elevated !border !border-border !text-text-primary",description:"!text-text-secondary",actionButton:"!bg-accent !text-white",cancelButton:"!bg-bg-overlay !text-text-primary"}}}/>;}
export const toast={success:(m:string,a?:{label:string;onClick:()=>void})=>sonnerToast.success(m,a?{action:a}:{}),error:(m:string,a?:{label:string;onClick:()=>void})=>sonnerToast.error(m,a?{action:a}:{}),warning:(m:string,a?:{label:string;onClick:()=>void})=>sonnerToast.warning(m,a?{action:a}:{}),info:(m:string,a?:{label:string;onClick:()=>void})=>sonnerToast.info(m,a?{action:a}:{})};
