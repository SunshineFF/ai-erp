export function NotFoundPage() { return <div className="panel empty-state"><h2>页面不存在</h2><p>请从左侧菜单进入业务页面。</p></div>; }
export function ForbiddenPage() { return <div className="panel empty-state"><h2>无权访问</h2><p>当前角色没有访问该页面的权限。</p></div>; }
