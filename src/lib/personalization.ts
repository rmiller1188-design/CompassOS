export type ThemeMode = "system" | "light" | "dark";
export type Accent = "violet" | "blue" | "green" | "orange" | "rose" | "graphite" | "cyan" | "red" | "gold";
export type Density = "compact" | "comfortable" | "spacious";
export type Radius = "square" | "soft" | "round" | "pill";
export type Surface = "solid" | "glass" | "paper" | "midnight";
export type Motion = "full" | "reduced" | "none";
export type Scale = "small" | "normal" | "large";
export type NavMode = "expanded" | "compact" | "icons";
export type Chrome = "minimal" | "balanced" | "expressive";
export type Background = "calm" | "gradient" | "graphite" | "warm" | "ocean";
export type CardSize = "auto" | "compact" | "wide" | "full";
export type WorkspaceWidth = "focused" | "standard" | "wide" | "fluid";
export type Spacing = "tight" | "standard" | "airy";
export type Elevation = "flat" | "soft" | "raised";
export type HeaderMode = "sticky" | "static" | "hidden";
export type AppearanceProfile = { mode:ThemeMode; accent:Accent; density:Density; radius:Radius; surface:Surface; motion:Motion; scale:Scale; navMode:NavMode; chrome:Chrome; background:Background; workspaceWidth:WorkspaceWidth; spacing:Spacing; elevation:Elevation; headerMode:HeaderMode; reducedTransparency:boolean; showHelperText:boolean; showTimestamps:boolean };
export type LayoutRule = { order?:number; size?:CardSize; hidden?:boolean };
export type LayoutSettings = Record<string,Record<string,LayoutRule>>;
export const defaultAppearance:AppearanceProfile={mode:"system",accent:"violet",density:"comfortable",radius:"round",surface:"glass",motion:"full",scale:"normal",navMode:"expanded",chrome:"balanced",background:"calm",workspaceWidth:"standard",spacing:"standard",elevation:"soft",headerMode:"sticky",reducedTransparency:false,showHelperText:true,showTimestamps:true};
const allowed={mode:new Set(["system","light","dark"]),accent:new Set(["violet","blue","green","orange","rose","graphite","cyan","red","gold"]),density:new Set(["compact","comfortable","spacious"]),radius:new Set(["square","soft","round","pill"]),surface:new Set(["solid","glass","paper","midnight"]),motion:new Set(["full","reduced","none"]),scale:new Set(["small","normal","large"]),navMode:new Set(["expanded","compact","icons"]),chrome:new Set(["minimal","balanced","expressive"]),background:new Set(["calm","gradient","graphite","warm","ocean"]),workspaceWidth:new Set(["focused","standard","wide","fluid"]),spacing:new Set(["tight","standard","airy"]),elevation:new Set(["flat","soft","raised"]),headerMode:new Set(["sticky","static","hidden"]),size:new Set(["auto","compact","wide","full"])};
function record(v:unknown):Record<string,unknown>{return v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};}
function enumValue<T extends string>(v:unknown,s:Set<string>,f:T):T{return typeof v==="string"&&s.has(v)?v as T:f;}
function boolValue(v:unknown,f:boolean){return typeof v==="boolean"?v:f;}
export function settingsRecord(v:unknown){return record(v);}
export function normalizeAppearance(v:unknown):AppearanceProfile{const i=record(v);return{mode:enumValue(i.mode,allowed.mode,defaultAppearance.mode),accent:enumValue(i.accent,allowed.accent,defaultAppearance.accent),density:enumValue(i.density,allowed.density,defaultAppearance.density),radius:enumValue(i.radius,allowed.radius,defaultAppearance.radius),surface:enumValue(i.surface,allowed.surface,defaultAppearance.surface),motion:enumValue(i.motion,allowed.motion,defaultAppearance.motion),scale:enumValue(i.scale,allowed.scale,defaultAppearance.scale),navMode:enumValue(i.navMode,allowed.navMode,defaultAppearance.navMode),chrome:enumValue(i.chrome,allowed.chrome,defaultAppearance.chrome),background:enumValue(i.background,allowed.background,defaultAppearance.background),workspaceWidth:enumValue(i.workspaceWidth,allowed.workspaceWidth,defaultAppearance.workspaceWidth),spacing:enumValue(i.spacing,allowed.spacing,defaultAppearance.spacing),elevation:enumValue(i.elevation,allowed.elevation,defaultAppearance.elevation),headerMode:enumValue(i.headerMode,allowed.headerMode,defaultAppearance.headerMode),reducedTransparency:boolValue(i.reducedTransparency,false),showHelperText:boolValue(i.showHelperText,true),showTimestamps:boolValue(i.showTimestamps,true)};}
export function normalizeLayout(v:unknown):LayoutSettings{const input=record(v),output:LayoutSettings={};for(const[page,raw]of Object.entries(input)){const rows=record(raw),rules:Record<string,LayoutRule>={};for(const[card,rr]of Object.entries(rows)){const row=record(rr),rule:LayoutRule={};if(typeof row.order==="number"&&Number.isFinite(row.order))rule.order=Math.trunc(row.order);if(typeof row.hidden==="boolean")rule.hidden=row.hidden;if(typeof row.size==="string"&&allowed.size.has(row.size))rule.size=row.size as CardSize;if(Object.keys(rule).length)rules[card]=rule;}if(Object.keys(rules).length)output[page]=rules;}return output;}
