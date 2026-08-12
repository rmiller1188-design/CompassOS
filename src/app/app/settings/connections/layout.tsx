import type { ReactNode } from "react";
import styles from "./connections.module.css";

export default function ConnectionsLayout({ children }: { children: ReactNode }) {
  return <div className={styles.controlCenter}>{children}</div>;
}
