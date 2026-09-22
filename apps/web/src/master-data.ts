import seed from './data/master-data.json';

export type Category = { id: string; name: string; products: number };
export type Branch = { id: string; name: string; address: string; status: 'ACTIVE' | 'SETUP' };
export type Staff = { id: string; name: string; role: 'MANAGER' | 'CASHIER'; branchIds: string[] };
export type Cost = { id: string; productName: string; amount: string };
export type MasterData = { categories: Category[]; branches: Branch[]; staff: Staff[]; costs: Cost[] };

export type CreateCategory = Pick<Category, 'name'>;
export type CreateBranch = Pick<Branch, 'name' | 'address'>;
export type CreateStaff = Pick<Staff, 'name' | 'role' | 'branchIds'>;
export type CreateCost = Pick<Cost, 'productName' | 'amount'>;

/**
 * The future API implementation must retain this tenant-scoped contract. The UI is
 * deliberately independent from Prisma/PostgreSQL while master-data tables are pending.
 */
export interface MasterDataRepository {
  list(): Promise<MasterData>;
  createCategory(input: CreateCategory): Promise<Category>;
  createBranch(input: CreateBranch): Promise<Branch>;
  createStaff(input: CreateStaff): Promise<Staff>;
  createCost(input: CreateCost): Promise<Cost>;
}

const copy = <T>(value: T): T => structuredClone(value);

class JsonMasterDataRepository implements MasterDataRepository {
  private data: MasterData = copy(seed) as MasterData;

  async list() { return copy(this.data); }
  async createCategory(input: CreateCategory) {
    const item: Category = { id: crypto.randomUUID(), name: input.name, products: 0 };
    this.data.categories.push(item); return copy(item);
  }
  async createBranch(input: CreateBranch) {
    const item: Branch = { id: crypto.randomUUID(), name: input.name, address: input.address || 'ยังไม่ได้ระบุ', status: 'SETUP' };
    this.data.branches.push(item); return copy(item);
  }
  async createStaff(input: CreateStaff) {
    const item: Staff = { id: crypto.randomUUID(), ...input };
    this.data.staff.push(item); return copy(item);
  }
  async createCost(input: CreateCost) {
    const item: Cost = { id: crypto.randomUUID(), ...input };
    this.data.costs.push(item); return copy(item);
  }
}

export const masterDataRepository: MasterDataRepository = new JsonMasterDataRepository();
