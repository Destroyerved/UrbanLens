import type { LngLat } from "@/types";
import { apiGet } from "./api";

export interface LocationItem {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  category_label: string;
  city_id?: string;
  city_name?: string;
  address: string;
  coord: LngLat;
  zoom?: number;
  description?: string;
}

export const CURATED_LOCATIONS: LocationItem[] = [
  {
    id: "iar-gandhinagar",
    name: "Institute of Advanced Research (IAR)",
    aliases: ["iar", "iar gandhinagar", "institute of advanced research", "iar university", "koba iar", "institue of advancerd research"],
    category: "university",
    category_label: "Research University",
    city_id: "gandhinagar",
    city_name: "Gandhinagar",
    address: "Institutional Area, Koba, Gandhinagar, Gujarat 382007",
    coord: [72.6697, 23.1486],
    zoom: 16.0,
    description: "Premier university & research institute in biotechnology, bioinformatics, engineering & life sciences.",
  },
  {
    id: "iit-gandhinagar",
    name: "IIT Gandhinagar (IITGN)",
    aliases: ["iit gandhinagar", "iitgn", "iit", "indian institute of technology"],
    category: "university",
    category_label: "Institute of National Importance",
    city_id: "gandhinagar",
    city_name: "Gandhinagar",
    address: "Palaj, Gandhinagar, Gujarat 382355",
    coord: [72.6841, 23.2125],
    zoom: 15.5,
    description: "Premier national engineering and technology institute on the banks of Sabarmati.",
  },
  {
    id: "iim-ahmedabad",
    name: "IIM Ahmedabad (IIMA)",
    aliases: ["iim ahmedabad", "iima", "iim", "indian institute of management"],
    category: "university",
    category_label: "Management Institute",
    city_id: "ahmedabad",
    city_name: "Ahmedabad",
    address: "Vastrapur, Ahmedabad, Gujarat 380015",
    coord: [72.5350, 23.0315],
    zoom: 15.5,
    description: "World-renowned management institute designed by Louis Kahn.",
  },
  {
    id: "cept-university",
    name: "CEPT University",
    aliases: ["cept", "cept university", "centre for environmental planning and technology"],
    category: "university",
    category_label: "Architecture & Planning University",
    city_id: "ahmedabad",
    city_name: "Ahmedabad",
    address: "Navrangpura, Ahmedabad, Gujarat 380009",
    coord: [72.5489, 23.0378],
    zoom: 15.5,
    description: "Premier university for architecture, urban planning, and human habitats.",
  },
  {
    id: "nid-ahmedabad",
    name: "National Institute of Design (NID)",
    aliases: ["nid", "nid ahmedabad", "national institute of design"],
    category: "university",
    category_label: "Design Institute",
    city_id: "ahmedabad",
    city_name: "Ahmedabad",
    address: "Paldi, Ahmedabad, Gujarat 380007",
    coord: [72.5694, 23.0118],
    zoom: 15.5,
    description: "Internationally acclaimed design institute.",
  },
  {
    id: "daiict-gandhinagar",
    name: "DA-IICT (Dhirubhai Ambani Institute)",
    aliases: ["daiict", "da-iict", "dhirubhai ambani institute"],
    category: "university",
    category_label: "ICT University",
    city_id: "gandhinagar",
    city_name: "Gandhinagar",
    address: "Near Indroda Circle, Gandhinagar, Gujarat 382007",
    coord: [72.6289, 23.1884],
    zoom: 15.5,
    description: "Leading ICT engineering and research university.",
  },
  {
    id: "pdpu-gandhinagar",
    name: "PDEU / PDPU (Pandit Deendayal Energy University)",
    aliases: ["pdpu", "pdeu", "pandit deendayal energy university", "raysan pdpu"],
    category: "university",
    category_label: "Energy University",
    city_id: "gandhinagar",
    city_name: "Gandhinagar",
    address: "Knowledge Corridor, Raysan, Gandhinagar 382007",
    coord: [72.6644, 23.1558],
    zoom: 15.5,
    description: "Leading university for energy, solar, and technology research.",
  },
  {
    id: "gnlu-gandhinagar",
    name: "Gujarat National Law University (GNLU)",
    aliases: ["gnlu", "gujarat national law university", "koba gnlu"],
    category: "university",
    category_label: "National Law University",
    city_id: "gandhinagar",
    city_name: "Gandhinagar",
    address: "Attalika Avenue, Knowledge Corridor, Koba, Gandhinagar 382007",
    coord: [72.6258, 23.1539],
    zoom: 15.5,
    description: "Statutory national law university in Gandhinagar.",
  },
  {
    id: "nfsu-gandhinagar",
    name: "National Forensic Sciences University (NFSU)",
    aliases: ["nfsu", "national forensic sciences university", "gfsu"],
    category: "university",
    category_label: "Forensic Sciences University",
    city_id: "gandhinagar",
    city_name: "Gandhinagar",
    address: "Sector 9, Gandhinagar, Gujarat 382007",
    coord: [72.6375, 23.1970],
    zoom: 15.5,
    description: "World's only dedicated forensic sciences university.",
  },
  {
    id: "gift-city",
    name: "GIFT City (Gujarat International Finance Tec-City)",
    aliases: ["gift city", "gift", "gujarat international finance tec-city", "ifsc"],
    category: "business",
    category_label: "International Financial Hub",
    city_id: "gandhinagar",
    city_name: "Gandhinagar",
    address: "GIFT City, Gandhinagar, Gujarat 382355",
    coord: [72.6845, 23.1610],
    zoom: 14.8,
    description: "India's first smart city and International Financial Services Centre.",
  },
  {
    id: "infocity-gandhinagar",
    name: "Infocity Gandhinagar",
    aliases: ["infocity", "infocity gandhinagar", "infocity it park"],
    category: "business",
    category_label: "IT / Tech Hub",
    city_id: "gandhinagar",
    city_name: "Gandhinagar",
    address: "Infocity, Gandhinagar, Gujarat 382007",
    coord: [72.6272, 23.1930],
    zoom: 15.2,
    description: "Major information technology park in Gandhinagar.",
  },
  {
    id: "mahatma-mandir",
    name: "Mahatma Mandir Convention Centre",
    aliases: ["mahatma mandir", "vibrant gujarat venue"],
    category: "landmark",
    category_label: "Convention Center",
    city_id: "gandhinagar",
    city_name: "Gandhinagar",
    address: "Sector 13, Gandhinagar, Gujarat 382016",
    coord: [72.6468, 23.2325],
    zoom: 15.0,
    description: "Host of Vibrant Gujarat Global Summit.",
  },
  {
    id: "science-city",
    name: "Gujarat Science City",
    aliases: ["science city", "science city ahmedabad", "robotics gallery", "aquatic gallery"],
    category: "landmark",
    category_label: "Science Center",
    city_id: "ahmedabad",
    city_name: "Ahmedabad",
    address: "Science City Rd, Hebatpur, Ahmedabad 380060",
    coord: [72.4965, 23.0784],
    zoom: 15.0,
    description: "Science education center with robotics and aquatic galleries.",
  },
  {
    id: "narendra-modi-stadium",
    name: "Narendra Modi Stadium (Motera)",
    aliases: ["narendra modi stadium", "motera stadium", "motera", "cricket stadium"],
    category: "landmark",
    category_label: "Cricket Stadium",
    city_id: "ahmedabad",
    city_name: "Ahmedabad",
    address: "Motera, Ahmedabad, Gujarat 380005",
    coord: [72.5972, 23.0917],
    zoom: 15.2,
    description: "World's largest cricket stadium with 132,000 capacity.",
  },
  {
    id: "sabarmati-ashram",
    name: "Sabarmati Ashram (Gandhi Ashram)",
    aliases: ["sabarmati ashram", "gandhi ashram", "hridaya kunj"],
    category: "landmark",
    category_label: "Heritage Site",
    city_id: "ahmedabad",
    city_name: "Ahmedabad",
    address: "Ashram Rd, Ahmedabad, Gujarat 380027",
    coord: [72.5807, 23.0605],
    zoom: 15.5,
    description: "Historic residence of Mahatma Gandhi.",
  },
  {
    id: "kankaria-lake",
    name: "Kankaria Lakefront",
    aliases: ["kankaria lake", "kankaria", "naginawadi"],
    category: "landmark",
    category_label: "Lakefront & Garden",
    city_id: "ahmedabad",
    city_name: "Ahmedabad",
    address: "Maninagar, Ahmedabad, Gujarat 380022",
    coord: [72.6022, 22.9975],
    zoom: 15.0,
    description: "Historic circular lakefront and recreation hub.",
  },
  {
    id: "sarkhej-roza",
    name: "Sarkhej Roza Heritage Complex",
    aliases: ["sarkhej roza", "sarkhej"],
    category: "landmark",
    category_label: "Heritage Complex",
    city_id: "ahmedabad",
    city_name: "Ahmedabad",
    address: "Sarkhej, Makarba, Ahmedabad 380051",
    coord: [72.5028, 22.9814],
    zoom: 15.5,
    description: "Famous Sufi monument and architectural complex.",
  },
  {
    id: "adalaj-stepwell",
    name: "Adalaj Stepwell (Rudabai Stepwell)",
    aliases: ["adalaj stepwell", "adalaj", "adalaj vav"],
    category: "landmark",
    category_label: "Historical Stepwell",
    city_id: "gandhinagar",
    city_name: "Gandhinagar",
    address: "Adalaj, Gandhinagar, Gujarat 382421",
    coord: [72.5815, 23.1667],
    zoom: 15.5,
    description: "15th-century ornate octagonal stepwell.",
  },
  {
    id: "akshardham-gandhinagar",
    name: "Akshardham Temple Gandhinagar",
    aliases: ["akshardham", "akshardham gandhinagar"],
    category: "landmark",
    category_label: "Temple Complex",
    city_id: "gandhinagar",
    city_name: "Gandhinagar",
    address: "Sector 20, Gandhinagar, Gujarat 382020",
    coord: [72.6738, 23.2294],
    zoom: 15.2,
    description: "Iconic Hindu temple complex built from pink sandstone.",
  },
  {
    id: "civil-hospital-asarwa",
    name: "Ahmedabad Civil Hospital, Asarwa",
    aliases: ["civil hospital", "asarwa civil hospital", "bj medical"],
    category: "hospital",
    category_label: "Apex Healthcare Complex",
    city_id: "ahmedabad",
    city_name: "Ahmedabad",
    address: "Asarwa, Ahmedabad, Gujarat 380016",
    coord: [72.6050, 23.0520],
    zoom: 15.5,
    description: "One of Asia's largest public hospital complexes.",
  },
  {
    id: "svp-hospital",
    name: "Sardar Vallabhbhai Patel (SVP) Hospital",
    aliases: ["svp hospital", "svp", "vs hospital"],
    category: "hospital",
    category_label: "Tertiary Care Hospital",
    city_id: "ahmedabad",
    city_name: "Ahmedabad",
    address: "Ellisbridge, Paldi, Ahmedabad 380006",
    coord: [72.5710, 23.0060],
    zoom: 15.5,
    description: "Modern 1500-bed tertiary public hospital on riverfront.",
  },
];

/** Search curated locations synchronously for zero-latency instant matching. */
export function searchCuratedLocations(query: string, limit: number = 8): LocationItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const matches: { item: LocationItem; score: number }[] = [];
  for (const item of CURATED_LOCATIONS) {
    let score = 0;
    const nameLower = item.name.toLowerCase();
    if (nameLower.includes(q)) score += 100;
    if (item.aliases.some((a) => a.includes(q) || q.includes(a))) score += 80;
    if (item.address.toLowerCase().includes(q)) score += 50;
    if (item.description?.toLowerCase().includes(q)) score += 30;

    const qWords = q.split(/\s+/).filter(Boolean);
    const nWords = nameLower.split(/\s+/);
    const overlap = qWords.filter((w) => nWords.some((nw) => nw.includes(w))).length;
    score += overlap * 25;

    if (score > 0) matches.push({ item, score });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit).map((m) => m.item);
}

/** Async search fetching from backend geocoding / OSM fallback. */
export async function searchAllLocations(query: string, cityId?: string): Promise<LocationItem[]> {
  const local = searchCuratedLocations(query, 6);
  if (local.length >= 4) return local;

  try {
    const res = await apiGet<{ results: LocationItem[] }>(
      `/api/locations/search?q=${encodeURIComponent(query)}${cityId ? `&city=${cityId}` : ""}`
    );
    if (res?.results && res.results.length > 0) {
      const seen = new Set(local.map((l) => `${l.coord[0].toFixed(3)},${l.coord[1].toFixed(3)}`));
      const combined = [...local];
      for (const r of res.results) {
        const key = `${r.coord[0].toFixed(3)},${r.coord[1].toFixed(3)}`;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(r);
        }
      }
      return combined.slice(0, 10);
    }
  } catch {}

  return local;
}
