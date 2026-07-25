"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { UserRoleAssignRow } from "@/components/UserRoleAssignRow";

interface RoleOption {
  id: string;
  name_ar: string;
}

interface UserRow {
  id: string;
  employee_number: string;
  full_name_ar: string;
  auth_user_id: string | null;
  currentRoleIds: string[];
}

const PAGE_SIZE = 10;

/**
 * Extracted from AdminPage 2026-07-25 ("لو اضفنا الموظفين طالت القائمة ولا
 * كان هناك فرق بينها وبين صفحة الموظفين") -- with every employee auto-listed
 * here, this table would otherwise grow to match /employees exactly with no
 * real distinction. Search + pagination keeps it usable at any headcount,
 * and paginating by default (rather than rendering the full roster) is the
 * actual differentiator from /employees: that page is the browsable full
 * directory, this one is a targeted "find someone, (re)assign their role"
 * tool -- matching this table's real purpose (only the role column has any
 * content beyond what /employees already shows).
 */
export function AdminUsersTable({
  users,
  roleOptions,
  roles,
  canManage,
  noneLabel,
}: {
  users: UserRow[];
  roleOptions: RoleOption[];
  roles: RoleOption[];
  canManage: boolean;
  noneLabel: string;
}) {
  const t = useTranslations("AdminPage");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return users;
    return users.filter((u) => u.full_name_ar.includes(q) || u.employee_number.includes(q));
  }, [users, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  return (
    <div>
      <div style={{ position: "relative", maxWidth: 320, marginBottom: 14 }}>
        <Search
          size={15}
          style={{ position: "absolute", insetInlineStart: 10, top: "50%", transform: "translateY(-50%)", color: "var(--sru-muted)" }}
          aria-hidden
        />
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={t("usersSearchPlaceholder")}
          style={{
            width: "100%",
            padding: "8px 34px 8px 10px",
            borderRadius: "var(--sru-radius)",
            border: "1px solid var(--sru-border)",
            fontSize: 13,
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "var(--sru-muted)", fontSize: 14 }}>{t("usersNoSearchResults")}</p>
      ) : (
        <>
          <div className="sru-card">
            <div className="table-scroll">
              <table className="admin-matrix">
                <thead>
                  <tr>
                    <th>{t("userColumnNumber")}</th>
                    <th>{t("userColumnName")}</th>
                    <th>{t("userColumnRole")}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((employee) => (
                    <tr key={employee.id}>
                      <td style={{ fontSize: 13 }}>{employee.employee_number}</td>
                      <td style={{ fontSize: 13 }}>{employee.full_name_ar}</td>
                      <td>
                        {canManage ? (
                          <UserRoleAssignRow
                            profileId={employee.id}
                            authUserId={employee.auth_user_id}
                            roles={roleOptions}
                            initialRoleIds={employee.currentRoleIds}
                          />
                        ) : (
                          <span style={{ fontSize: 13 }}>
                            {employee.currentRoleIds.length > 0
                              ? employee.currentRoleIds
                                  .map((id) => roles.find((r) => r.id === id)?.name_ar)
                                  .filter(Boolean)
                                  .join("، ")
                              : noneLabel}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <p style={{ fontSize: 12.5, color: "var(--sru-muted)", margin: 0 }}>
              {t("usersPaginationShowing", {
                from: pageStart + 1,
                to: Math.min(pageStart + PAGE_SIZE, filtered.length),
                total: filtered.length,
              })}
            </p>
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  className="sru-icon-action"
                  style={{ width: "auto", padding: "6px 12px", fontSize: 12.5 }}
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("usersPaginationPrev")}
                </button>
                <span style={{ fontSize: 12.5, color: "var(--sru-muted)" }}>
                  {t("usersPaginationPage", { page: currentPage, totalPages })}
                </span>
                <button
                  type="button"
                  className="sru-icon-action"
                  style={{ width: "auto", padding: "6px 12px", fontSize: 12.5 }}
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t("usersPaginationNext")}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
