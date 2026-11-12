import { useState } from 'react';
import { AlertTriangle, ClipboardList, PackagePlus, Share2, ShoppingCart, Trash2, Truck } from 'lucide-react';
import type { AppData, Producto } from '@/domain/model';
import * as L from '@/domain/logic';
import * as S from '@/domain/stock';
import { MEDIOS } from '@/domain/movimientos';
import { sb } from '@/lib/supabase';
import { usePeriod } from '@/state/period';
import { useAccion, useFeedback } from '@/state/feedback';
import { PeriodBar } from '@/components/PeriodBar';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, Empty, Kpi, Row, cx } from '@/components/ui';
import { Field, Input, Select, Sheet } from '@/components/ui/form';

const fmt = L.formatoPesos;
const TABLAS = ['productos', 'mov_stock', 'proveedores', 'gastos'] as const;
type Hoja = { t: 'nuevo' } | { t: 'compra'; id?: string } | { t: 'ficha'; id: string } | { t: 'prov' } | { t: 'pedido' } | null;

/** Stock del dueño (V.stk). */
export function StockPage({ d }: { d: AppData }) {
  const { per, ref } = usePeriod();
  const [a, b] = L.rango(per, ref), r = S.resumenStock(d, a, b);
  const [hoja, setHoja] = useState<Hoja>(null), cerrar = () => setHoja(null);
  const ficha = hoja?.t == 'ficha' ? d.productos.find((p) => p.id == hoja.id) : undefined;
  const fila = (p: Producto, sub?: string) => (
    <button key={p.id} className="block w-full text-left" onClick={() => setHoja({ t: 'ficha', id: p.id })}>
      <Row left={p.nombre} sub={sub} right={<span className={cx(S.esBajo(p) && 'text-ko')}>{p.stock}{sub ? '' : ` u. (mín. ${p.stockMin || 0})`}</span>} />
    </button>
  );
  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Stock" subtitle={`${r.productos.length} productos`} actions={
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setHoja({ t: 'nuevo' })}><PackagePlus size={16} /> Producto</Button>
          <Button variant="outline" onClick={() => setHoja({ t: 'compra' })}><ShoppingCart size={16} /> Compra</Button>
        </div>
      } />
      <PeriodBar />
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Valor inventario" value={fmt(r.valorCosto)} />
        <Kpi label="Valor de venta" value={fmt(r.valorVenta)} tone="accent" />
        <Kpi label="Poco stock" value={r.bajos.length} tone={r.bajos.length ? 'ko' : undefined} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => setHoja({ t: 'prov' })}><Truck size={16} /> Proveedores ({d.proveedores.length})</Button>
        <Button variant="outline" onClick={() => setHoja({ t: 'pedido' })}><ClipboardList size={16} /> Pedido sugerido</Button>
      </div>
      {r.bajos.length > 0 && <Card title={<span className="flex items-center gap-2 text-ko"><AlertTriangle size={14} /> Poco stock</span>}>{r.bajos.map((p) => fila(p))}</Card>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        {r.categorias.length ? r.categorias.map((c) => (
          <Card key={c} title={c}>{r.productos.filter((p) => (p.categoria || 'Otros') == c).map((p) => fila(p, `costo ${fmt(p.costo)} · venta ${fmt(p.precio)} · margen ${S.margenPct(p)}%${S.nombreProveedor(d, p.proveedorId) ? ' · ' + S.nombreProveedor(d, p.proveedorId) : ''}`))}</Card>
        )) : <Card><Empty>Sin productos. Agregá el primero con "Producto".</Empty></Card>}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <Card title="Más vendidos del período">{r.masVendidos.length ? r.masVendidos.map(([n, q]) => <Row key={n} left={n} right={`${q} u.`} />) : <Empty>Sin ventas.</Empty>}</Card>
        <Card title="Historial de movimientos" className="lg:col-span-2">
          {r.movimientos.length ? r.movimientos.map((x) => <Row key={x.id} left={`${x.fecha.slice(5)} · ${x.nombre}`} sub={S.detalleMovStock(d, x)} right={<span className={x.signo > 0 ? 'text-ok' : 'text-ko'}>{x.signo > 0 ? '+' : '-'}{x.cantidad} u.</span>} />) : <Empty>Sin movimientos.</Empty>}
        </Card>
      </div>
      {hoja?.t == 'nuevo' && <FormProducto d={d} onClose={cerrar} />}
      {hoja?.t == 'compra' && <Compra d={d} id={hoja.id} onClose={cerrar} />}
      {ficha && <Ficha d={d} p={ficha} onClose={cerrar} onCompra={() => setHoja({ t: 'compra', id: ficha.id })} />}
      {hoja?.t == 'prov' && <Proveedores d={d} onClose={cerrar} />}
      {hoja?.t == 'pedido' && <Pedido d={d} onClose={cerrar} />}
    </div>
  );
}

function CamposProducto({ d, x, set, nuevo }: { d: AppData; x: S.FormProducto; set(p: Partial<S.FormProducto>): void; nuevo: boolean }) {
  const num = (k: keyof S.FormProducto, label: string) => <Field label={label}>{(id) => <Input id={id} type="number" inputMode="decimal" value={x[k] ?? ''} onChange={(e) => set({ [k]: e.target.value })} />}</Field>;
  return (
    <>
      <Field label="Nombre">{(id) => <Input id={id} value={x.nombre} onChange={(e) => set({ nombre: e.target.value })} />}</Field>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Categoría">{(id) => <Select id={id} value={x.categoria} onChange={(e) => set({ categoria: e.target.value })}>{S.CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
        <Field label="Proveedor">{(id) => <Select id={id} value={x.proveedor} onChange={(e) => set({ proveedor: e.target.value })}><option value="">{nuevo ? 'Proveedor (opcional)' : 'Sin proveedor'}</option>{d.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select>}</Field>
        {num('costo', 'Precio de compra (costo)')}{num('precio', 'Precio de venta')}{num('comision', '% comisión al vender')}{num('minimo', 'Stock mínimo (alerta)')}
        {nuevo && num('stockInicial', 'Stock inicial')}
      </div>
    </>
  );
}

function FormProducto({ d, onClose }: { d: AppData; onClose(): void }) {
  const [x, setX] = useState<S.FormProducto>({ nombre: '', categoria: S.CATEGORIAS[0], proveedor: '', costo: '', precio: '', comision: '', stockInicial: '', minimo: '' });
  const { run, ocupado } = useAccion(), { toast } = useFeedback();
  const guardar = async () => { const e = S.validarProducto(x); if (e) return toast(e); if (await run(async () => { await S.crearProducto(sb, x); return 'Producto agregado'; }, [...TABLAS])) onClose(); };
  return <Sheet title="Nuevo producto" onClose={onClose} footer={<Button className="h-12 w-full" disabled={ocupado} onClick={guardar}>Agregar producto</Button>}><CamposProducto d={d} x={x} set={(p) => setX((v) => ({ ...v, ...p }))} nuevo /></Sheet>;
}

function Compra({ d, id, onClose }: { d: AppData; id?: string; onClose(): void }) {
  const P = S.productosOrdenados(d);
  const [x, setX] = useState<S.FormCompra>({ producto: id ?? P[0]?.id ?? '', proveedor: '', cantidad: '', costo: '', fecha: L.today(), medio: 'efectivo' });
  const set = (p: Partial<S.FormCompra>) => setX((v) => ({ ...v, ...p }));
  const { run, ocupado } = useAccion(), { toast } = useFeedback();
  const guardar = async () => { const e = S.validarCompra(x); if (e) return toast(e); if (await run(async () => { await S.registrarCompra(sb, x); return 'Compra registrada'; }, [...TABLAS])) onClose(); };
  return (
    <Sheet title="Registrar compra" onClose={onClose} footer={<Button className="h-12 w-full" disabled={ocupado} onClick={guardar}>Registrar compra</Button>}>
      <Field label="Producto">{(fid) => <Select id={fid} value={x.producto} onChange={(e) => set({ producto: e.target.value })}>{P.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select>}</Field>
      <Field label="Proveedor">{(fid) => <Select id={fid} value={x.proveedor} onChange={(e) => set({ proveedor: e.target.value })}><option value="">Proveedor (opcional)</option>{d.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select>}</Field>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Cantidad">{(fid) => <Input id={fid} type="number" inputMode="numeric" value={x.cantidad} onChange={(e) => set({ cantidad: e.target.value })} />}</Field>
        <Field label="Costo unitario">{(fid) => <Input id={fid} type="number" inputMode="decimal" value={x.costo} onChange={(e) => set({ costo: e.target.value })} />}</Field>
        <Field label="Fecha">{(fid) => <Input id={fid} type="date" value={x.fecha} onChange={(e) => set({ fecha: e.target.value })} />}</Field>
        <Field label="Medio de pago">{(fid) => <Select id={fid} value={x.medio} onChange={(e) => set({ medio: e.target.value })}>{MEDIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
      </div>
    </Sheet>
  );
}

function Ficha({ d, p, onClose, onCompra }: { d: AppData; p: Producto; onClose(): void; onCompra(): void }) {
  const [x, setX] = useState<S.FormProducto>({ nombre: p.nombre, categoria: p.categoria || 'Otros', proveedor: p.proveedorId, costo: String(p.costo), precio: String(p.precio), comision: String(p.comisionPct), minimo: String(p.stockMin || 0) });
  const [real, setReal] = useState(''), [pq, setPq] = useState(''), [pm, setPm] = useState('');
  const { run, ocupado } = useAccion(), { toast, confirmar } = useFeedback();
  const hacer = async (fn: () => Promise<unknown>, msg: string) => { if (await run(async () => { await fn(); return msg; }, [...TABLAS])) onClose(); };
  return (
    <Sheet title={p.nombre} onClose={onClose}>
      <p className="mb-4 text-sm text-muted">Stock {p.stock} · mínimo {p.stockMin || 0} · {S.ventasProducto(d, p)} ventas registradas</p>
      <CamposProducto d={d} x={x} set={(v) => setX((o) => ({ ...o, ...v }))} nuevo={false} />
      <div className="mb-6 grid grid-cols-2 gap-2">
        <Button disabled={ocupado} onClick={() => { const e = S.validarProducto(x); if (e) return toast(e); hacer(() => S.actualizarProducto(sb, p.id, x), 'Producto actualizado'); }}>Guardar cambios</Button>
        <Button variant="outline" onClick={onCompra}><ShoppingCart size={16} /> Compra</Button>
      </div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-subtle">Ajustar stock (conteo físico)</h3>
      <div className="mb-6 flex gap-2"><Input aria-label="Stock real contado" placeholder="Stock real contado" type="number" value={real} onChange={(e) => setReal(e.target.value)} />
        <Button variant="outline" disabled={ocupado} onClick={() => (real === '' ? toast('Ingresá el stock real') : hacer(() => S.ajustarStock(sb, p.id, real), 'Stock ajustado'))}>Ajustar</Button></div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-subtle">Pérdida o producto dañado</h3>
      <div className="mb-6 grid grid-cols-[1fr_2fr_auto] gap-2">
        <Input aria-label="Cantidad perdida" placeholder="Cant." type="number" value={pq} onChange={(e) => setPq(e.target.value)} />
        <Input aria-label="Motivo" placeholder="Motivo (vencido, roto…)" value={pm} onChange={(e) => setPm(e.target.value)} />
        <Button variant="outline" disabled={ocupado} onClick={() => (!(+pq > 0) ? toast('Poné la cantidad') : hacer(() => S.registrarPerdida(sb, p.id, pq, pm), 'Pérdida registrada'))}>Registrar</Button>
      </div>
      <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-subtle">Últimos movimientos</h3>
      {S.historialProducto(d, p).length ? S.historialProducto(d, p).map((m) => <Row key={m.id} left={`${m.fecha.slice(5)} · ${m.tipo}`} sub={m.proveedor || m.nota} right={<span className={m.signo > 0 ? 'text-ok' : 'text-ko'}>{m.signo > 0 ? '+' : '-'}{m.cantidad}</span>} />) : <Empty>Sin movimientos.</Empty>}
      <Button variant="ghost" className="mt-4 w-full text-ko" disabled={ocupado} onClick={async () => {
        if (await confirmar({ titulo: `¿Quitar ${p.nombre} de la lista?`, texto: 'Deja de aparecer en Stock y en el botón +. Su historial se conserva.', accion: 'Quitar', peligro: true })) hacer(() => S.quitarProducto(sb, p.id), 'Producto quitado');
      }}><Trash2 size={16} /> Quitar producto de la lista</Button>
    </Sheet>
  );
}

function Proveedores({ d, onClose }: { d: AppData; onClose(): void }) {
  const [n, setN] = useState(''), [t, setT] = useState(''), [o, setO] = useState('');
  const { run, ocupado } = useAccion(), { toast, confirmar } = useFeedback();
  const agregar = () => { const e = S.validarProveedor(n); if (e) return toast(e); run(async () => { await S.crearProveedor(sb, n, t, o); setN(''); setT(''); setO(''); return 'Proveedor agregado'; }, ['proveedores']); };
  return (
    <Sheet title="Proveedores" onClose={onClose}>
      {d.proveedores.length ? d.proveedores.map((x) => (
        <Row key={x.id} left={x.nombre} sub={[x.telefono, x.notas].filter(Boolean).join(' ')} right={
          <button aria-label={`Quitar ${x.nombre}`} className="rounded-lg p-2 text-subtle hover:text-ko" onClick={async () => { if (await confirmar({ titulo: `¿Quitar a ${x.nombre}?`, accion: 'Quitar', peligro: true })) run(async () => { await S.quitarProveedor(sb, x.id); }, ['proveedores']); }}><Trash2 size={16} /></button>
        } />
      )) : <Empty>Sin proveedores.</Empty>}
      <div className="mt-4">
        <Field label="Nombre del proveedor">{(id) => <Input id={id} value={n} onChange={(e) => setN(e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Teléfono (opcional)">{(id) => <Input id={id} type="tel" value={t} onChange={(e) => setT(e.target.value)} />}</Field>
          <Field label="Notas (opcional)">{(id) => <Input id={id} value={o} onChange={(e) => setO(e.target.value)} />}</Field>
        </div>
        <Button className="w-full" disabled={ocupado} onClick={agregar}>Agregar proveedor</Button>
      </div>
    </Sheet>
  );
}

function Pedido({ d, onClose }: { d: AppData; onClose(): void }) {
  const p = S.pedidoSugerido(d), { toast } = useFeedback();
  const compartir = async () => { const t = 'Pedido Barber Hood\n\n' + p.texto; try { if (navigator.share) await navigator.share({ text: t }); else { await navigator.clipboard.writeText(t); toast('Pedido copiado'); } } catch { /* cancelado */ } };
  return (
    <Sheet title="Pedido sugerido" onClose={onClose} footer={p.grupos.length ? <Button className="h-12 w-full" onClick={compartir}><Share2 size={16} /> Compartir pedido</Button> : undefined}>
      <p className="mb-3 text-xs text-muted">Cantidad sugerida: hasta tener el doble del stock mínimo.</p>
      {p.grupos.length ? p.grupos.map(([k, x]) => (
        <div key={k} className="mb-4"><h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-accent">{k}</h3>{x.map((y) => <Row key={y.nombre} left={y.nombre} right={`x${y.cantidad}`} />)}</div>
      )) : <Empty>No hay productos con poco stock.</Empty>}
    </Sheet>
  );
}
