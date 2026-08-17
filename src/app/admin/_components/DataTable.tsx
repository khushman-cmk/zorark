"use client";

import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

export default function DataTable<T>({
  data,
  columns,
  total,
  page,
  limit,
  onPageChange,
  isLoading,
  emptyMessage = "No records found",
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(total / limit),
  });

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="data-table-wrapper">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="table-loading-cell">
                  <div className="loading-shimmer" />
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="table-empty-cell">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
          <button
            className="pagination-btn"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
          >
            «
          </button>
          <button
            className="pagination-btn"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            ‹
          </button>
          <span className="pagination-page">
            {page} / {totalPages || 1}
          </span>
          <button
            className="pagination-btn"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            ›
          </button>
          <button
            className="pagination-btn"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}
