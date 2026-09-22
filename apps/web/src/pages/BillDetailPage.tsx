import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { request } from "../api";

const billTypeLabels: Record<string, string> = { RECEIVABLE: "应收", PAYABLE: "应付" };
const billStatusLabels: Record<string, string> = { OPEN: "待结算", SETTLED: "已结算", VOIDED: "已作废" };
const statusBadgeClass: Record<string, string> = { OPEN: "status-badge status-muted", SETTLED: "status-badge status-shipped", VOIDED: "status-badge status-muted" };

export function BillDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [bill, setBill] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => { void request<any>(`/finance/bills/${id}`).then(setBill).catch((reason) => setError(reason instanceof Error ? reason.message : "加载失败")); }, [id]);
  const lines = bill?.lines ?? [];
  const linesTotal = lines.reduce((sum: number, line: any) => sum + Number(line.amount), 0);
  const title = bill ? `${bill.billNo}（${billTypeLabels[bill.billType] ?? bill.billType}）` : "账单详情";
  return <section className="panel table-panel bill-detail-panel">
    <button className="ghost-action" onClick={() => navigate("/finance")}><ArrowLeft size={15} />返回财务</button>
    <div className="panel-title"><FileText size={18} /><h2>{title}</h2>{bill && <span className={statusBadgeClass[bill.status] ?? "status-badge status-muted"}>{billStatusLabels[bill.status] ?? bill.status}</span>}</div>
    {error && <div className="error banner">{error}</div>}
    {!bill && !error && <div className="empty">加载中...</div>}
    {bill && <>
      <div className="bill-detail-grid">
        <div className="bill-detail-item"><span>账单号</span><strong>{bill.billNo}</strong></div>
        <div className="bill-detail-item"><span>类型</span><strong>{billTypeLabels[bill.billType] ?? bill.billType}</strong></div>
        <div className="bill-detail-item"><span>{bill.billType === "RECEIVABLE" ? "客户" : "供应商"}</span><strong>{bill.customer?.name ?? bill.supplier?.name ?? "-"}</strong></div>
        <div className="bill-detail-item"><span>账单日期</span><strong>{new Date(bill.billDate).toLocaleDateString()}</strong></div>
        <div className="bill-detail-item"><span>到期日</span><strong>{bill.dueDate ? new Date(bill.dueDate).toLocaleDateString() : "-"}</strong></div>
        <div className="bill-detail-item"><span>金额</span><strong>{Number(bill.amount).toFixed(2)} {bill.currencyCode}</strong></div>
        <div className="bill-detail-item"><span>创建时间</span><strong>{new Date(bill.createdAt).toLocaleString()}</strong></div>
        <div className="bill-detail-item"><span>描述</span><strong>{bill.description ?? "-"}</strong></div>
      </div>
      <h3 className="bill-lines-title">账单明细（{lines.length} 单）</h3>
      <div className="table-scroll"><table>
        <thead><tr><th>来源单号</th><th>订单日期</th><th>金额</th></tr></thead>
        <tbody>
          {lines.map((line: any) => <tr key={line.id}><td>{line.documentNo}</td><td>{new Date(line.orderDate).toLocaleDateString()}</td><td>{Number(line.amount).toFixed(2)}</td></tr>)}
          <tr className="bill-lines-total"><td>合计</td><td>{lines.length} 单</td><td>{linesTotal.toFixed(2)} {bill.currencyCode}</td></tr>
        </tbody>
      </table>{!lines.length && <div className="empty">暂无账单明细</div>}</div>
    </>}
  </section>;
}
