"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, User, Shield, MapPin, Calendar, Clock, Activity, AlertTriangle, MessageSquare, Tag as TagIcon, ShieldAlert, MonitorSmartphone, Car, LogOut, Search } from "lucide-react";
import { clsx } from "clsx";

export default function CustomerDetailClient({ customer, trips, sessions, notes, tags }: any) {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/customers" className="p-2 hover:bg-zinc-100 rounded-full transition text-zinc-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-3">
            {customer.name}
            {!customer.isActive && (
              <span className="text-xs font-semibold bg-red-100 text-red-700 px-2.5 py-0.5 rounded-full border border-red-200 uppercase">Suspended</span>
            )}
            {customer.role === "admin" && (
              <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2.5 py-0.5 rounded-full border border-purple-200 uppercase flex items-center gap-1">
                <Shield className="w-3 h-3" /> Admin
              </span>
            )}
          </h1>
          <p className="text-zinc-500">Customer ID: {customer.id}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-zinc-200">
          {[
            { id: "overview", label: "Overview", icon: User },
            { id: "trips", label: "Trip History", icon: MapPin },
            { id: "notes", label: "Notes & Tags", icon: MessageSquare },
            { id: "security", label: "Security", icon: ShieldAlert },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.id 
                  ? "border-[#ff0055] text-[#ff0055]" 
                  : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 mb-4 uppercase tracking-wider">Contact Info</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-zinc-100">
                      <span className="text-zinc-500 text-sm">Email</span>
                      <span className="text-zinc-900 font-medium">{customer.email}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-zinc-100">
                      <span className="text-zinc-500 text-sm">Mobile</span>
                      <span className="text-zinc-900 font-medium">{customer.mobile}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-zinc-100">
                      <span className="text-zinc-500 text-sm">Joined</span>
                      <span className="text-zinc-900 font-medium">{new Date(customer.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 mb-4 uppercase tracking-wider">Quick Actions</h3>
                  <div className="flex flex-wrap gap-3">
                    <button className="px-4 py-2 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 rounded-lg text-sm font-medium transition">
                      Send Password Reset
                    </button>
                    {customer.isActive ? (
                      <button className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg text-sm font-medium transition flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> Suspend Account
                      </button>
                    ) : (
                      <button className="px-4 py-2 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg text-sm font-medium transition">
                        Reactivate Account
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-zinc-900 mb-4 uppercase tracking-wider">Stats</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-100">
                    <div className="text-zinc-500 text-sm flex items-center gap-2 mb-2"><Activity className="w-4 h-4" /> Total Trips</div>
                    <div className="text-3xl font-bold text-zinc-900">{trips.length}</div>
                  </div>
                  <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-100">
                    <div className="text-zinc-500 text-sm flex items-center gap-2 mb-2"><Car className="w-4 h-4" /> Vehicles Saved</div>
                    <div className="text-3xl font-bold text-zinc-900">0</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "trips" && (
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 mb-4">Trip History</h3>
              {trips.length === 0 ? (
                <div className="text-center py-10 bg-zinc-50 rounded-xl border border-zinc-100">
                  <p className="text-zinc-500">No trips recorded for this customer.</p>
                </div>
              ) : (
                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-zinc-500 font-medium">
                      <tr>
                        <th className="px-6 py-3">Date</th>
                        <th className="px-6 py-3">Route</th>
                        <th className="px-6 py-3">Distance</th>
                        <th className="px-6 py-3">Costs</th>
                        <th className="px-6 py-3">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {trips.map((t: any) => (
                        <tr key={t.id} className="hover:bg-zinc-50">
                          <td className="px-6 py-4 text-zinc-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                          <td className="px-6 py-4 font-medium text-zinc-900">{t.origin} → {t.destination}</td>
                          <td className="px-6 py-4 text-zinc-600">{t.distanceKm} km</td>
                          <td className="px-6 py-4">
                            <div className="text-xs text-zinc-500">Fuel: ₹{t.fuelCost || 0}</div>
                            <div className="text-xs text-zinc-500">Toll: ₹{t.tollCost || 0}</div>
                          </td>
                          <td className="px-6 py-4 capitalize">{t.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "notes" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-2 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">Admin Notes</h3>
                  {notes.length === 0 ? (
                    <p className="text-zinc-500 text-sm">No notes added yet.</p>
                  ) : (
                     <div className="space-y-4">
                       {notes.map((n: any) => (
                         <div key={n.id} className="bg-amber-50/50 p-4 rounded-xl border border-amber-100">
                           <p className="text-zinc-800 text-sm">{n.noteText}</p>
                           <div className="mt-2 text-xs text-zinc-400 flex items-center gap-2">
                             <Clock className="w-3 h-3" /> {new Date(n.createdAt).toLocaleString()}
                           </div>
                         </div>
                       ))}
                     </div>
                  )}
                  
                  <div className="mt-4 pt-4 border-t border-zinc-100">
                    <textarea 
                      placeholder="Add a new note (internal only)..." 
                      className="w-full p-3 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#ff0055] min-h-[100px]"
                    ></textarea>
                    <button className="mt-3 bg-zinc-900 hover:bg-black text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                      Save Note
                    </button>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2"><TagIcon className="w-4 h-4" /> Tags</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {tags.length === 0 ? (
                    <p className="text-zinc-500 text-sm">No tags.</p>
                  ) : (
                    tags.map((t: any) => (
                      <span key={t.id} className="bg-zinc-100 text-zinc-700 px-3 py-1 rounded-full text-xs font-medium border border-zinc-200">
                        {t.tag}
                      </span>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <input type="text" placeholder="Add tag..." className="flex-1 px-3 py-1.5 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#ff0055]" />
                  <button className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-3 py-1.5 rounded-lg text-sm font-medium transition border border-zinc-200">Add</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-semibold text-zinc-900 mb-4">Active Sessions</h3>
                {sessions.length === 0 ? (
                   <p className="text-zinc-500 text-sm">No active sessions.</p>
                ) : (
                  <div className="space-y-3">
                    {sessions.map((s: any) => (
                      <div key={s.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                        <div className="flex items-center gap-4">
                          <MonitorSmartphone className="w-6 h-6 text-zinc-400" />
                          <div>
                            <div className="font-medium text-zinc-900">{s.device || "Unknown Device"}</div>
                            <div className="text-xs text-zinc-500 mt-0.5">
                              IP: {s.ipAddress?.replace(/\.\d+\.\d+$/, ".X.X") || "Unknown"} • Last active: {new Date(s.lastActive).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <button className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition flex items-center gap-2 text-sm font-medium">
                           <LogOut className="w-4 h-4" /> Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="pt-6 border-t border-red-100">
                <h3 className="text-lg font-semibold text-red-700 mb-2">Danger Zone</h3>
                <p className="text-zinc-500 text-sm mb-4">Super admin actions. Use with caution.</p>
                
                <div className="flex gap-4">
                  <button className="px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition">
                    Anonymize Account
                  </button>
                  <button className="px-4 py-2 bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-50 rounded-lg text-sm font-medium transition">
                    Impersonate User
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
