"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Filter, MoreVertical, Shield, User, ChevronLeft, ChevronRight } from "lucide-react";

type Customer = {
  id: string;
  name: string;
  email: string;
  mobile: string;
  isActive: boolean;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  tripCount: number;
};

export default function CustomerListClient({
  customers,
  initialSearch,
  initialStatus,
  page,
  totalPages
}: {
  customers: Customer[];
  initialSearch: string;
  initialStatus: string;
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);

  const applyFilters = (newSearch: string, newStatus: string) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (newSearch) params.set("search", newSearch);
    else params.delete("search");
    
    if (newStatus && newStatus !== "all") params.set("status", newStatus);
    else params.delete("status");
    
    params.set("page", "1"); // Reset to page 1 on filter
    
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      applyFilters(search, status);
    }
  };

  // Masking phone number function
  const maskPhone = (phone: string) => {
    if (phone.length < 10) return phone;
    return `${phone.slice(0, 3)}XXXX${phone.slice(-3)}`;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
      {/* Toolbar */}
      <div className="p-4 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-4 bg-zinc-50/50">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search name, email, phone..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="pl-9 pr-4 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 w-full sm:w-64"
            />
          </div>
          
          <select 
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              applyFilters(search, e.target.value);
            }}
            className="pl-3 pr-8 py-2 border border-zinc-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 appearance-none"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        
        <div>
           {/* Bulk actions could go here */}
           <button className="text-sm font-medium text-zinc-600 bg-white border border-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-50 flex items-center gap-2">
             <Filter className="w-4 h-4" /> Export CSV
           </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-zinc-50 text-zinc-500 font-medium">
            <tr>
              <th className="px-6 py-3">Customer</th>
              <th className="px-6 py-3">Contact</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Role</th>
              <th className="px-6 py-3">Trips</th>
              <th className="px-6 py-3">Joined</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {customers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
                  No customers found matching your filters.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50 transition">
                  <td className="px-6 py-4">
                    <Link href={`/admin/customers/${c.id}`} className="font-semibold text-zinc-900 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-zinc-900">{c.email}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{maskPhone(c.mobile)}</div>
                  </td>
                  <td className="px-6 py-4">
                    {c.isActive ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/10">
                        Suspended
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {c.role === "admin" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded-md">
                        <Shield className="w-3 h-3" /> Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
                        <User className="w-3 h-3" /> User
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-600 font-medium">
                    {c.tripCount}
                  </td>
                  <td className="px-6 py-4 text-zinc-500">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/admin/customers/${c.id}`} className="text-zinc-400 hover:text-zinc-900 inline-block p-1">
                      <MoreVertical className="w-5 h-5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-zinc-200 flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button 
              disabled={page <= 1}
              onClick={() => {
                const p = new URLSearchParams(searchParams.toString());
                p.set("page", (page - 1).toString());
                router.push(`${pathname}?${p.toString()}`);
              }}
              className="p-2 border border-zinc-300 rounded-md hover:bg-zinc-50 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              disabled={page >= totalPages}
              onClick={() => {
                const p = new URLSearchParams(searchParams.toString());
                p.set("page", (page + 1).toString());
                router.push(`${pathname}?${p.toString()}`);
              }}
              className="p-2 border border-zinc-300 rounded-md hover:bg-zinc-50 disabled:opacity-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
