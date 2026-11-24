export interface UserDirectory {
  findById(id: any): Promise<any>;
}

export class InMemoryUserDirectory implements UserDirectory {
  constructor(private readonly users: any[]) {}

  async findById(id: any) {
    return this.users.filter((u) => u.id === id)[0];
  }
}
