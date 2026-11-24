/** Every list endpoint returns this envelope. */
export interface Page<T> {
  data: T[];
  page: {
    limit: number;
    /** Opaque. Pass it back as ?cursor= to get the next page. null = this was the last page. */
    nextCursor: string | null;
  };
}
