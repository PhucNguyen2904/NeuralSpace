import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
export interface UserInfo { user_id: string; email: string; full_name?: string; avatar_url?: string; }
interface AuthState { user: UserInfo | null; token: string | null; isLoading: boolean; setAuth: (user: UserInfo, token: string) => void; clearAuth: () => void; }
export const useAuthStore = create<AuthState>()(persist((set)=>({ user:null, token:null, isLoading:false, setAuth:(user,token)=>set({user,token,isLoading:false}), clearAuth:()=>set({user:null, token:null, isLoading:false}) }),{ name:"auth-store", storage:createJSONStorage(()=>localStorage), partialize:(s)=>({ token:s.token }) }));
