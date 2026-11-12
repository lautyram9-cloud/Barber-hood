import { useState } from 'react';
import { Package, Plus } from 'lucide-react';
import type { AppData } from '@/domain/model';
import * as L from '@/domain/logic';
import * as M from '@/domain/movimientos';
import { sb } from '@/lib/supabase';
import { useAccion, useFeedback } from '@/state/feedback';
import { Button, cx } from '@/components/ui';
import { Chip, Field, Input, Select, Sheet } from '@/components/ui/form';

type Modo = 'ing' | 'fijo' | 'variable';

/** Botón flotante "+" para registrar un ingreso (o un gasto, solo el dueño). */
export function BotonMas({ d, owner, me }: { d: AppData; owner: boolean; me: string | null }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button onClick={() => setAbierto(true)} aria-label={owner ? 'Registrar ingreso o gasto' : 'Registrar ingreso'}
        className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_12px_32px_-8px_var(--color-accent)] transition hover:bg-accent-strong active:scale-95 lg:bottom-8 lg:right-8">
        <Plus size={26} />
      </button>
      {abierto && <Registro d={d} owner={owner} me={me} onClose={() => setAbierto(false)} />}
    </>
  );
}

function Registro({ d, owner, me, onClose }: { d: AppData; owner: boolean; me: string | null; onClose(): void }) {
  const [modo, setModo] = useState<Modo>('ing');
  const titulo = modo == 'ing' ? 'Nuevo ingreso' : `Nuevo gasto ${modo}`;
  return (
    <Sheet title={titulo} onClose={onClose}>
      {owner && (
        <div role="tablist" aria-label="Ingreso o gasto" className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-bg p-1">
          {([['ing', 'Ingreso'], ['fijo', 'Gasto fijo'], ['variable', 'Gasto variable']] as [Modo, string][]).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={modo == k} onClick={() => setModo(k)} className={cx('min-h-9 rounded-lg text-sm font-medium', modo == k ? 'bg-surface-2 text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-muted')}>{l}</button>
          ))}
        </div>
      )}
      {modo == 'ing' ? <FormIngreso d={d} owner={owner} me={me} onDone={onClose} /> : <FormGasto key={modo} tipo={modo} onDone={onClose} />}
    </Sheet>
  );
}

function FormIngreso({ d, owner, me, onDone }: { d: AppData; owner: boolean; me: string | null; onDone(): void }) {
  const [op] = useState(() => crypto.randomUUID()); // mismo id si se reintenta: la base evita el doble registro
  const [x, setX] = useState<M.IngresoRapido>({ tipo: 'servicio', concepto: '', monto: '', cantidad: '1', productoId: '', cliente: '', barbero: me ?? '', fecha: L.today(), medio: 'efectivo', cobrado: true });
  const set = (p: Partial<M.IngresoRapido>) => setX((v) => ({ ...v, ...p }));
  const { run, ocupado } = useAccion();
  const { toast } = useFeedback();
  const productos = d.productos.filter((p) => p.stock > 0);
  const guardar = async () => {
    const err = M.validarIngresoRapido(x);
    if (err) return toast(err);
    if (await run(() => M.guardarIngresoRapido(sb, d, x, op, me), ['ingresos', 'productos', 'mov_stock', 'clientes'])) onDone();
  };
  return (
    <>
      {(d.servicios.length > 0 || productos.length > 0) && (
        <>
          <p className="mb-2 text-xs text-muted">Tocá para completar el precio</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {d.servicios.map((s) => <Chip key={s.id} on={x.tipo == 'servicio' && x.concepto == s.nombre} onClick={() => set({ tipo: 'servicio', concepto: s.nombre, monto: String(s.precio), productoId: '' })}>{s.nombre} · {L.formatoPesos(s.precio)}</Chip>)}
            {productos.map((p) => <Chip key={p.id} on={x.productoId == p.id} onClick={() => set({ tipo: 'producto', concepto: p.nombre, monto: String(p.precio), productoId: p.id })}><Package size={13} className="mr-1 inline" />{p.nombre} · {L.formatoPesos(p.precio)}</Chip>)}
          </div>
        </>
      )}
      <div className="grid gap-x-3 sm:grid-cols-2">
        <Field label="Tipo">{(id) => <Select id={id} value={x.tipo} onChange={(e) => set({ tipo: e.target.value })}><option value="servicio">Servicio</option><option value="producto">Producto</option></Select>}</Field>
        <Field label="Servicio o producto">{(id) => <Input id={id} value={x.concepto} onChange={(e) => set({ concepto: e.target.value })} />}</Field>
        <Field label={x.tipo == 'producto' ? 'Precio unitario' : 'Monto'}>{(id) => <Input id={id} type="number" inputMode="decimal" value={x.monto} onChange={(e) => set({ monto: e.target.value })} />}</Field>
        <Field label="Cantidad (productos)">{(id) => <Input id={id} type="number" inputMode="numeric" value={x.cantidad} onChange={(e) => set({ cantidad: e.target.value })} />}</Field>
        <Field label="Cliente (opcional)">{(id) => <Input id={id} value={x.cliente} onChange={(e) => set({ cliente: e.target.value })} />}</Field>
        <Field label="Barbero">{(id) => (
          <Select id={id} value={me ?? x.barbero} disabled={!owner} onChange={(e) => set({ barbero: e.target.value })}>
            {owner ? <><option value="">Sin barbero</option>{d.barberos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</> : d.barberos.filter((b) => b.id == me).map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </Select>
        )}</Field>
        <Field label="Fecha">{(id) => <Input id={id} type="date" value={x.fecha} onChange={(e) => set({ fecha: e.target.value })} />}</Field>
        <Field label="Medio de pago">{(id) => <Select id={id} value={x.medio} onChange={(e) => set({ medio: e.target.value })}>{M.MEDIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
      </div>
      <Field label="Estado del cobro">{(id) => <Select id={id} value={x.cobrado ? '1' : '0'} onChange={(e) => set({ cobrado: e.target.value != '0' })}><option value="1">Cobrado ahora</option><option value="0">Pendiente de cobro</option></Select>}</Field>
      <Button className="mt-1 h-12 w-full" disabled={ocupado} onClick={guardar}>Registrar ingreso</Button>
    </>
  );
}

function FormGasto({ tipo, onDone }: { tipo: 'fijo' | 'variable'; onDone(): void }) {
  const [x, setX] = useState<M.GastoRapido>({ tipo, concepto: '', monto: '', fecha: L.today(), medio: 'efectivo' });
  const set = (p: Partial<M.GastoRapido>) => setX((v) => ({ ...v, ...p }));
  const { run, ocupado } = useAccion();
  const { toast } = useFeedback();
  const guardar = async () => {
    const err = M.validarGasto(x);
    if (err) return toast(err);
    if (await run(async () => { await M.guardarGastoRapido(sb, x); return 'Gasto registrado'; }, ['gastos'])) onDone();
  };
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">{M.GASTOS_RAPIDOS[tipo].map((g) => <Chip key={g} on={x.concepto == g} onClick={() => set({ concepto: g })}>{g}</Chip>)}</div>
      <Field label="Concepto">{(id) => <Input id={id} value={x.concepto} onChange={(e) => set({ concepto: e.target.value })} />}</Field>
      <div className="grid gap-x-3 sm:grid-cols-3">
        <Field label="Monto">{(id) => <Input id={id} type="number" inputMode="decimal" value={x.monto} onChange={(e) => set({ monto: e.target.value })} />}</Field>
        <Field label="Fecha">{(id) => <Input id={id} type="date" value={x.fecha} onChange={(e) => set({ fecha: e.target.value })} />}</Field>
        <Field label="Medio de pago">{(id) => <Select id={id} value={x.medio} onChange={(e) => set({ medio: e.target.value })}>{M.MEDIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
      </div>
      <Button className="mt-1 h-12 w-full" disabled={ocupado} onClick={guardar}>Registrar gasto</Button>
    </>
  );
}
