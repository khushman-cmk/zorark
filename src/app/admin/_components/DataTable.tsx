"use client";

import { ReactNode } from "react";

// Simple, self-contained paginated table — no TanStack Table v9 dependency
// to avoid its complex multi-generic TypeScript API.

export interface Column<T> {
  key: string;
  header: string;
  cell?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

export default function DataTable<T extends object>({
  data,
  columns,
  total,
  page,
  limit,
  onPageChange,
  isLoading,
  emptyMessage = "No records found",
}: DataTableProps<T>) {
  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="data-table-wrapper">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="table-loading-cell">
                  <div className="loading-shimmer" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="table-empty-cell">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={(row as Record<string, unknown>).id as string ?? i}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.cell
                        ? col.cell(row)
                        : String((row as Record<string, unknown>)[col.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="table-pagination">
        <span className="pagination-info">
          {total === 0
            ? "0 records"
            : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} of ${total}`}
        </span>
        <div className="pagination-controls">
          <button className="pagination-btn" onClick={() => onPageChange(1)} disabled={page <= 1}>«</button>
          <button className="pagination-btn" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>‹</button>
          <span className="pagination-page">{page} / {totalPages}</span>
          <button className="pagination-btn" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>›</button>
          <button className="pagination-btn" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}>»</button>
        </div>
      </div>
    </div>
  );
}
