import { api, type BatchOp } from "./api";
import type { Session } from "./constants";
import { counts, listRoutes, listVehicles, saveStore } from "./data";

/** 動作確認用のサンプル（すべて架空の名前）。店舗が 1 件もないときだけ投入する。 */
export async function seedSample(): Promise<number | null> {
  if ((await counts()).stores > 0) return null;
  const storeId = await saveStore({
    name: "サンプル店",
    display_name: "East-one サンプル店",
    phone: "000-000-0000",
    contact_name: "管理者",
    capacity_am: 18,
    capacity_pm: 18,
    required_staff: 5,
    min_nurse: 1,
    min_trainer: 1,
    closed_weekdays: "0",
    am_slots: "9:45,10:00,10:10,10:25,10:35,10:50",
    pm_slots: "14:05,14:20,14:45,14:55,15:10,15:20",
    slot_capacity: 5,
    sort_order: 1,
  });

  const staff: [string, string, string, string, number][] = [
    ["青木", "管理者", "A", "運転,体操,事務", 5],
    ["井上", "生活相談員兼介護職員", "B", "運転,添乗,体操,メディカルケア,FIT,血圧測定", 5],
    ["上田", "介護職員", "A", "運転,添乗,体操,メディカルケア,FIT", 5],
    ["江口", "生活相談員兼介護職員", "D", "運転,添乗,整体,体操", 4],
    ["大野", "機能訓練指導員", "B", "整体,個別機能訓練", 5],
    ["加藤", "機能訓練指導員", "A", "整体,個別機能訓練,運転", 5],
    ["木村", "機能訓練指導員兼介護職員", "D", "整体,個別機能訓練,運転", 4],
    ["工藤", "ドライバー", "D", "運転", 5],
    ["小池", "看護師", "C", "血圧測定", 4],
    ["佐々木", "看護師", "D", "血圧測定", 3],
  ];
  const staffRes = await api.batch(
    staff.map(([name, role, employment, skills, days], i) => ({
      op: "put",
      c: "staff",
      id: null,
      data: {
        name,
        status: "在籍",
        contract: employment === "A" || employment === "B" ? "正社員" : days >= 4 ? "時短社員" : "パート",
        patterns: employment === "A" || employment === "B" ? "8:30-17:30" : days >= 4 ? "9:00-16:00" : "9:00-13:30,13:00-17:30",
        employment,
        role,
        skills,
        days_per_week: days,
        available_weekdays: "1,2,3,4,5,6",
        note: "",
        sort_order: i + 1,
        store_ids: String(storeId),
      },
    })),
  );
  const staffIds = staffRes.map((r) => Number(r.id));

  const vehicles: [string, number][] = [
    ["シエンタ1", 4],
    ["セレナ", 6],
    ["ラウム", 4],
    ["ムーヴ", 3],
    ["シエンタ2", 4],
  ];
  await api.batch(
    vehicles.map(([name, capacity], i) => ({
      op: "put",
      c: "vehicles",
      id: null,
      data: { store_id: storeId, name, capacity, sort_order: i + 1, active: 1, driver_ids: name === "セレナ" ? [staffIds[7], staffIds[1], staffIds[2]].join(",") : "" },
    })),
  );
  const vs = await listVehicles(storeId);
  const routes: [string, string, string, string, string][] = [
    ["北ルート", "8:10", "11:00", "13:20", "15:20"],
    ["南ルート", "8:10", "11:00", "13:20", "15:25"],
    ["東ルート", "8:20", "11:10", "13:30", "15:30"],
    ["西ルート", "8:20", "11:10", "13:30", "15:30"],
  ];
  await api.batch(
    routes.map(([name, m, n, np, e], i) => ({
      op: "put",
      c: "routes",
      id: null,
      data: { store_id: storeId, name, vehicle_id: vs[i].id, morning_time: m, noon_time: n, noon_pick_time: np, evening_time: e, sort_order: i + 1 },
    })),
  );
  const rs = await listRoutes(storeId);
  const cmRes = await api.batch(
    ["ケアプラン東 田村", "ケアプラン西 中島", "地域包括 森"].map((c) => {
      const [office, name] = c.split(" ");
      return { op: "put", c: "care_managers", id: null, data: { name, office, phone: "", fax: "", note: "" } };
    }),
  );
  const cmIds = cmRes.map((r) => Number(r.id));

  const family = ["秋山", "石田", "宇野", "遠藤", "小川", "川口", "菊池", "久保", "小島", "斉藤", "清水", "杉本", "関", "高田", "千葉", "土屋", "中川", "西田", "野口", "浜田", "樋口", "福田", "堀", "松本", "宮本", "村上", "森田", "山口", "横山", "吉村"];
  const given = ["花子", "太郎", "春子", "一郎", "和子", "茂", "幸子", "清", "節子", "勇"];
  const levels = ["要支援1", "要支援2", "要支援2", "要介護1", "要介護1", "要介護2", "事業対象者", "要介護3"];
  const ops: BatchOp[] = family.map((f, i) => {
    const g = given[i % given.length];
    const session: Session = i % 2 === 0 ? "am" : "pm";
    return {
      op: "put",
      c: "clients",
      id: null,
      data: {
        store_id: storeId,
        name: `${f}${g}`,
        kana: "",
        care_level: levels[i % levels.length],
        gender: ["子", "代"].some((x) => g.endsWith(x)) ? "女" : "男",
        birth_date: "",
        age: 72 + (i % 20),
        care_manager_id: cmIds[i % cmIds.length],
        status: "利用中",
        new_flag: i === 3 ? "新規" : "",
        start_date: "",
        route_id: i % 9 === 8 ? null : rs[i % rs.length].id,
        route_order: i,
        uses_transport: i % 15 === 14 ? 0 : 1,
        needs_training: 1,
        address: "",
        note: "",
        slots: [(i % 6) + 1, ((i + 3) % 6) + 1].map((weekday) => ({ weekday, session })),
      },
    };
  });
  await api.batch(ops);
  return storeId;
}
