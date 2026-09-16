import { useEffect, useState } from "react";
import { Actions, DataTable, Modal, request, RoleForm, UserForm } from "../../shared/BusinessUi";
import { Pagination } from "../../shared/Pagination";
import { usePaginatedResource } from "../../hooks/usePaginatedResource";

export function AdminPanel() {
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [permissions, setPermissions] = useState<any[]>([]);
  const [roleOptions, setRoleOptions] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const resource = usePaginatedResource<any>(`/admin/${tab}`);

  const loadReference = async () => {
    const [permissionRows, roles] = await Promise.all([request<any[]>("/admin/permissions"), request<any[]>("/admin/role-options")]);
    setPermissions(permissionRows);
    setRoleOptions(roles);
  };
  useEffect(() => { void loadReference(); }, []);

  const saveUser = async (form: any) => {
    await request(editing?.id ? `/admin/users/${editing.id}` : "/admin/users", { method: editing?.id ? "PATCH" : "POST", body: JSON.stringify({ ...form, roleIds: form.roleId ? [form.roleId] : [] }) });
    setEditing(null);
    await resource.reload();
  };
  const saveRole = async (form: any) => {
    await request(editing?.id ? `/admin/roles/${editing.id}` : "/admin/roles", { method: editing?.id ? "PATCH" : "POST", body: JSON.stringify(form) });
    setEditing(null);
    await Promise.all([resource.reload(), loadReference()]);
  };

  const rows = tab === "users"
    ? resource.items.map((user) => [user.username, user.displayName, user.userRoles?.map((item: any) => item.role.name).join("、") || "未分配", user.isActive ? "启用" : "停用", <Actions key={user.id} name={`用户 ${user.username}`} onEdit={() => setEditing(user)} onDelete={async () => { await request(`/admin/users/${user.id}`, { method: "DELETE" }); await resource.reload(); }} />])
    : resource.items.map((role) => [role.code, role.name, role.rolePermissions?.length ?? 0, role.isActive ? "启用" : "停用", <Actions key={role.id} name={`角色 ${role.name}`} onEdit={() => setEditing(role)} onDelete={async () => { await request(`/admin/roles/${role.id}`, { method: "DELETE" }); await Promise.all([resource.reload(), loadReference()]); }} />]);

  return <section className="panel table-panel">
    <div className="tabs"><button className={tab === "users" ? "tab active" : "tab"} onClick={() => { setTab("users"); setEditing(null); }}>用户</button><button className={tab === "roles" ? "tab active" : "tab"} onClick={() => { setTab("roles"); setEditing(null); }}>角色与权限</button><button className="primary small" onClick={() => setEditing({})}>新增{tab === "users" ? "用户" : "角色"}</button></div>
    {resource.error && <div className="error banner">{resource.error}</div>}
    <DataTable columns={tab === "users" ? ["用户名", "姓名", "角色", "状态", "操作"] : ["编码", "名称", "权限数", "状态", "操作"]} rows={rows} />
    <Pagination page={resource.page} pageSize={resource.pageSize} total={resource.total} onPageChange={resource.setPage} onPageSizeChange={resource.setPageSize} />
    <Modal open={Boolean(editing)} title={editing?.id ? `编辑${tab === "users" ? "用户" : "角色"}` : `新增${tab === "users" ? "用户" : "角色"}`} onClose={() => setEditing(null)}>{tab === "users" ? <UserForm initial={editing ?? {}} roles={roleOptions} onSubmit={saveUser} /> : <RoleForm initial={editing ?? {}} permissions={permissions} onSubmit={saveRole} />}</Modal>
  </section>;
}
