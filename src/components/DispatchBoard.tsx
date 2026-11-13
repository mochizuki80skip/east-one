"use client";

import { useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RunKind } from "@/lib/constants";
import { distanceKm, type Point } from "@/lib/geo";
import type { DailyRun } from "@/lib/types";
import { btnSecondary, input } from "./ui";

export type BoardClient = { name: string; route: string; wheelchair: boolean; point: Point | null };
export type BoardVehicle = { id: number; name: string; capacity: number; wheelchairSeats: number; driverIds: number[] };
type StaffOption = { id: number; name: string };

type Props = {
  run: RunKind;
  label: string;
  note: string;
  /** この便のグループ */
  runs: DailyRun[];
  /** まだどのグループにも入っていない方 */
  pool: number[];
  client: (id: number) => BoardClient | undefined;
  /** 店舗の位置（近い順・遠い順の基準） */
  origin: Point | null;
  vehicles: BoardVehicle[];
  driverCands: StaffOption[];
  escortCands: StaffOption[];
  renderStaffSelect: (value: number | null, onChange: (v: number | null) => void, candidates: StaffOption[], extraClass?: string) => ReactNode;
  onPlace: (clientId: number, toKey: string | null, index?: number, newKey?: string) => void;
  onSetRun: (key: string, patch: Partial<DailyRun>) => void;
  onSort: (key: string, order: "near" | "far") => void;
  onAddGroup: () => void;
  onRemoveGroup: (key: string) => void;
};

const POOL = "pool";
const NEW = "new";
const groupId = (key: string) => `g-${key}`;
const itemId = (cid: number) => `c-${cid}`;
let newSeq = 0;

/**
 * ドロップ先の判定: 指（マウス）の下にある名前 → 指の下にある入れ物 → 一番近いもの の順。
 * 「新しいグループ」や空のグループに確実に入るようにする。
 */
const collision: CollisionDetection = (args) => {
  const under = pointerWithin(args);
  if (under.length) {
    const item = under.find((c) => String(c.id).startsWith("c-") && c.id !== args.active.id);
    return [item ?? under.find((c) => !String(c.id).startsWith("c-")) ?? under[0]];
  }
  return closestCorners(args);
};

export default function DispatchBoard(p: Props) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** 入れ物（未割り当て・各グループ）ごとの利用者の並び */
  const containers = new Map<string, number[]>([[POOL, p.pool], ...p.runs.map((r) => [groupId(r.key), r.riders.map((x) => x.client_id)] as [string, number[]])]);
  const containerOf = (cid: number) => [...containers.entries()].find(([, ids]) => ids.includes(cid))?.[0];

  const onDragStart = (e: DragStartEvent) => setActiveId(Number(String(e.active.id).slice(2)));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const cid = Number(String(active.id).slice(2));
    const from = containerOf(cid);
    const overId = String(over.id);
    let to: string;
    let index: number | undefined;
    if (overId.startsWith("c-")) {
      const overCid = Number(overId.slice(2));
      to = containerOf(overCid) ?? POOL;
      index = (containers.get(to) ?? []).indexOf(overCid);
    } else {
      to = overId;
    }
    if (to === from && to === POOL) return;
    if (to === POOL) return p.onPlace(cid, null);
    if (to === NEW) {
      const key = `g${Date.now()}_${newSeq++}`;
      return p.onPlace(cid, key, 0, key);
    }
    const key = to.slice(2);
    if (from === to && index !== undefined && (containers.get(to) ?? []).indexOf(cid) === index) return;
    p.onPlace(cid, key, index);
  };

  const active = activeId != null ? p.client(activeId) : undefined;
  const usedVehicles = p.runs.map((r) => r.vehicle_id).filter((x): x is number => x != null);
  const usedDrivers = p.runs.map((r) => r.driver_id).filter((x): x is number => x != null);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{p.label}</h3>
        <span className="text-xs text-slate-500">{p.note}</span>
        <button onClick={p.onAddGroup} className={`${btnSecondary} ml-auto text-xs`}>
          ＋ グループを追加
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          {/* 未割り当て */}
          <Container id={POOL} className="rounded border-2 border-dashed border-amber-300 bg-amber-50/60 p-2 lg:w-60 lg:shrink-0">
            <div className="mb-1 text-xs font-semibold text-amber-900">
              まだグループに入っていない方 {p.pool.length}名
              <span className="block font-normal text-amber-800">名前をつかんで右のグループへ</span>
            </div>
            <SortableContext items={p.pool.map(itemId)} strategy={rectSortingStrategy}>
              <div className="flex min-h-10 flex-wrap gap-1">
                {p.pool.map((cid) => (
                  <Chip key={cid} cid={cid} c={p.client(cid)} origin={p.origin} />
                ))}
                {p.pool.length === 0 && <span className="text-xs text-slate-400">全員グループに入っています</span>}
              </div>
            </SortableContext>
          </Container>

          {/* グループ */}
          <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {p.runs.map((r, gi) => {
              const v = r.vehicle_id != null ? p.vehicles.find((x) => x.id === r.vehicle_id) : undefined;
              const wc = r.riders.filter((x) => p.client(x.client_id)?.wheelchair).length;
              const over = v && r.riders.length > v.capacity;
              const wcOver = wc > 0 && v && wc > v.wheelchairSeats;
              const dupVehicle = r.vehicle_id != null && usedVehicles.filter((x) => x === r.vehicle_id).length > 1;
              const dupDriver = r.driver_id != null && usedDrivers.filter((x) => x === r.driver_id).length > 1;
              const allowed = v && v.driverIds.length ? p.driverCands.filter((s) => v.driverIds.includes(s.id)) : p.driverCands;
              return (
                <Container key={r.key} id={groupId(r.key)} className="rounded border bg-white">
                  <div className="space-y-1 border-b bg-slate-50 p-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="rounded bg-brand-600 px-1.5 text-xs font-bold text-white">グループ{gi + 1}</span>
                      <select
                        value={r.vehicle_id ?? ""}
                        onChange={(e) => p.onSetRun(r.key, { vehicle_id: e.target.value ? Number(e.target.value) : null })}
                        className={`${input} font-semibold ${dupVehicle || wcOver ? "border-red-500 text-red-700" : ""}`}
                      >
                        <option value="">車両はあとで</option>
                        {p.vehicles.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}（{x.capacity}名{x.wheelchairSeats ? `・♿${x.wheelchairSeats}` : ""}）
                          </option>
                        ))}
                      </select>
                      <input value={r.depart_time} onChange={(e) => p.onSetRun(r.key, { depart_time: e.target.value })} placeholder="時刻" className={`${input} w-16`} />
                      <button
                        onClick={() => p.onRemoveGroup(r.key)}
                        className="ml-auto text-xs text-red-600"
                        title="このグループをなくす（乗っていた方は「まだグループに入っていない方」に戻ります）"
                      >
                        解散
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      <span>運転</span>
                      {p.renderStaffSelect(r.driver_id, (x) => p.onSetRun(r.key, { driver_id: x }), allowed, dupDriver ? "border-red-500 text-red-700" : "")}
                      <span>添乗</span>
                      {p.renderStaffSelect(r.escort_id, (x) => p.onSetRun(r.key, { escort_id: x }), p.escortCands)}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-xs">
                      <button
                        onClick={() => p.onSort(r.key, "near")}
                        disabled={!p.origin || r.riders.length < 2}
                        className="rounded border border-slate-300 bg-white px-1.5 py-0.5 disabled:opacity-40"
                        title={p.origin ? "店舗から近い方から順に並べます" : "店舗設定で店舗の住所を入れると使えます"}
                      >
                        近い順
                      </button>
                      <button
                        onClick={() => p.onSort(r.key, "far")}
                        disabled={!p.origin || r.riders.length < 2}
                        className="rounded border border-slate-300 bg-white px-1.5 py-0.5 disabled:opacity-40"
                        title={p.origin ? "店舗から遠い方から順に並べます" : "店舗設定で店舗の住所を入れると使えます"}
                      >
                        遠い順
                      </button>
                      <span className={`ml-auto ${over || wcOver ? "font-bold text-red-700" : "text-slate-500"}`}>
                        {r.riders.length}名{v ? ` / ${v.capacity}` : ""}
                        {wc > 0 && `（♿${wc}${v ? ` / ${v.wheelchairSeats}` : ""}）`}
                      </span>
                    </div>
                    {over && <div className="text-xs text-red-700">乗車人数を超えています</div>}
                    {wcOver && <div className="text-xs text-red-700">{v!.wheelchairSeats ? "車イスの台数を超えています" : "車イス対応の車両を選んでください"}</div>}
                    {dupVehicle && <div className="text-xs text-red-700">同じ車両が別のグループにも入っています</div>}
                    {dupDriver && <div className="text-xs text-red-700">同じ運転者が別のグループにも入っています</div>}
                  </div>
                  <SortableContext items={r.riders.map((x) => itemId(x.client_id))} strategy={verticalListSortingStrategy}>
                    <div className="min-h-12 space-y-1 p-2">
                      {r.riders.map((x, i) => (
                        <Chip key={x.client_id} cid={x.client_id} c={p.client(x.client_id)} origin={p.origin} seq={i + 1} onRemove={() => p.onPlace(x.client_id, null)} />
                      ))}
                      {r.riders.length === 0 && <div className="rounded border border-dashed p-2 text-center text-xs text-slate-400">ここに名前をドラッグ</div>}
                    </div>
                  </SortableContext>
                </Container>
              );
            })}
            <Container id={NEW} className="flex min-h-24 items-center justify-center rounded border-2 border-dashed border-brand-200 p-3 text-center text-xs text-brand-700">
              ＋ ここにドラッグすると
              <br />
              新しいグループを作ります
            </Container>
          </div>
        </div>
        <DragOverlay>{activeId != null && active ? <ChipBody c={active} origin={p.origin} dragging /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Container({ id, className, children }: { id: string; className: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} data-drop={id} className={`${className} ${isOver ? "ring-2 ring-brand-400" : ""}`}>
      {children}
    </div>
  );
}

function Chip({ cid, c, origin, seq, onRemove }: { cid: number; c: BoardClient | undefined; origin: Point | null; seq?: number; onRemove?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: itemId(cid) });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.35 : 1 };
  return (
    <div ref={setNodeRef} style={style} data-client={cid}>
      <div className="flex items-center gap-1">
        {seq != null && <span className="w-4 text-right text-xs text-slate-400">{seq}</span>}
        <div {...attributes} {...listeners} className="flex-1 touch-none">
          <ChipBody c={c} origin={origin} />
        </div>
        {onRemove && (
          <button onClick={onRemove} className="px-1 text-xs text-slate-400 hover:text-red-600" title="グループから外す">
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function ChipBody({ c, origin, dragging }: { c: BoardClient | undefined; origin: Point | null; dragging?: boolean }) {
  const km = c?.point && origin ? distanceKm(origin, c.point) : null;
  return (
    <div
      className={`flex cursor-grab items-center gap-1 rounded border bg-white px-2 py-1 text-sm select-none active:cursor-grabbing ${
        dragging ? "border-brand-400 shadow-lg" : "border-slate-300 hover:border-brand-300"
      }`}
    >
      <span className="font-medium">{c?.name ?? "?"}</span>
      {c?.wheelchair && <span title="車イス">♿</span>}
      {c?.route && <span className="text-[10px] text-slate-400">{c.route}</span>}
      <span className="ml-auto pl-1 text-[10px] text-slate-500">{km != null ? `${km.toFixed(1)}km` : c?.point === null ? "位置?" : ""}</span>
    </div>
  );
}
