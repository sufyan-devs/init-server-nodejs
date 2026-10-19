import { makeManagedUserRouter } from '@user/routes/admin/managedUser';
import { ROLE_CODE } from '@user/models/Role';

export default makeManagedUserRouter(ROLE_CODE.CUSTOMER, {
  itemKey: 'customer',
  listKey: 'customers',
  title: 'Customer',
  roleName: 'Customer',
});
