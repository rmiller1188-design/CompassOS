import type { ReactNode } from "react";
import styles from "./messages.module.css";

export default function MessagesLayout({ children }: { children: ReactNode }) {
  return <div className={styles.communicationsPage}>{children}</div>;
}
