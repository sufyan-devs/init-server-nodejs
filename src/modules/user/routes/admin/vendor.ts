import { makeManagedUserRouter } from '@user/routes/admin/managedUser';
import { ROLE_CODE } from '@user/models/Role';

export default makeManagedUserRouter(ROLE_CODE.VENDOR, {
  itemKey: 'vendor',
  listKey: 'vendors',
  title: 'Vendor',
  roleName: 'Vendor',
});
