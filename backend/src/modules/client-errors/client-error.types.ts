// ClientErrorReport (task 8.1, design.md "Backend/client-errors" Service
// Interface).
export interface ClientErrorReport {
  message: string;
  stack?: string;
  pageUrl: string;
  occurredAt: string;
}
