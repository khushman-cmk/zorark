"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable, { type Column } from "../_components/DataTable";
import ConfirmModal from "../_components/ConfirmModal";

interface User {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface UsersResponse {
  data: User[];
  total: number;
  page: number;
  limit: number;
}

export default function UsersPage() {
  const [response, setResponse] = useState<UsersResponse | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");

  const [suspendTarget, setSuspendTarget] = useState<User | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("search", search);
    if (roleFilter) params.set("role", roleFilter);
    const res = await fetch(`/api/admin/users?${params}`);
    const data: UsersResponse = await res.json();
    setResponse(data);
    setLoading(false);
  }, [page, search, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function patchUser(id: string, body: object) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    fetchUsers();
  }

  async function deleteUser(id: string) {
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    fetchUsers();
  }

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "Name",
      cell: (u) => <span style={{ fontWeight: 600 }}>{u.name}</span>,
    },
    { key: "email", header: "Email" },
    { key: "mobile", header: "Mobile" },
    {
      key: "role",
      header: "Role",
      cell: (u) => (
        <span className={`badge ${u.role === "admin" ? "badge--amber" : "badge--gray"}`}>
          {u.role}
        </span>
      ),
    },
    {
      key: "isActive",
      header: "Status",
      cell: (u) => (
        <span className={`badge ${u.isActive ? "badge--green" : "badge--red"}`}>
          {u.isActive ? "Active" : "Suspended"}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Joined",
      cell: (u) =>
        new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(u.createdAt)),
    },
    {
      key: "id",
      header: "Actions",
      cell: (u) => (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <button
            className={`btn btn--sm ${u.isActive ? "btn--danger" : "btn--ghost"}`}
            onClick={() => setSuspendTarget(u)}
          >
            {u.isActive ? "Suspend" : "Unsuspend"}
          </button>
          {u.role !== "admin" && (
            <button className="btn btn--sm btn--ghost" onClick={() => setPromoteTarget(u)}>
              Make Admin
            </button>
          )}
          <button className="btn btn--sm btn--danger" onClick={() => setDeleteTarget(u)}>
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">User Management</h1>
        <p className="page-subtitle">View, suspend, promote and remove users</p>
      </div>

      <div className="table-container">
        <div className="table-toolbar">
          <input
            className="input"
            style={{ maxWidth: 260 }}
            placeholder="Search name or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setSearch(searchInput); setPage(1); }
            }}
          />
          <button className="btn btn--ghost btn--sm" onClick={() => { setSearch(searchInput); setPage(1); }}>
            Search
          </button>
          <select className="select" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
            <option value="">All roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          {(search || roleFilter) && (
            <button className="btn btn--ghost btn--sm" onClick={() => { setSearch(""); setSearchInput(""); setRoleFilter(""); setPage(1); }}>
              Clear
            </button>
          )}
        </div>

        <DataTable
          data={response?.data ?? []}
          columns={columns}
          total={response?.total ?? 0}
          page={page}
          limit={20}
          onPageChange={setPage}
          isLoading={loading}
          emptyMessage="No users found"
        />
      </div>

      <ConfirmModal
        open={!!suspendTarget}
        onOpenChange={(o) => !o && setSuspendTarget(null)}
        title={suspendTarget?.isActive ? "Suspend User" : "Unsuspend User"}
        description={suspendTarget?.isActive ? `Suspend ${suspendTarget.name}? They will be unable to log in.` : `Re-activate ${suspendTarget?.name}? They will be able to log in again.`}
        confirmLabel={suspendTarget?.isActive ? "Suspend" : "Unsuspend"}
        danger={suspendTarget?.isActive}
        onConfirm={() => suspendTarget && patchUser(suspendTarget.id, { isActive: !suspendTarget.isActive })}
      />

      <ConfirmModal
        open={!!promoteTarget}
        onOpenChange={(o) => !o && setPromoteTarget(null)}
        title="Grant Admin Access"
        description={`Are you sure you want to grant admin access to ${promoteTarget?.name}? They will have full control over this panel.`}
        confirmLabel="Grant Admin"
        danger
        onConfirm={() => promoteTarget && patchUser(promoteTarget.id, { role: "admin" })}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete User"
        description={`Permanently delete ${deleteTarget?.name}? Their trip data will be preserved but the account will be removed.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => deleteTarget && deleteUser(deleteTarget.id)}
      />
    </div>
  );
}
