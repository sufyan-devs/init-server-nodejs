import { makeManagedUserRouter } from '@user/routes/admin/managedUser';
import { ROLE_CODE } from '@user/models/Role';

export default makeManagedUserRouter(ROLE_CODE.BUSINESS_ASSOCIATE, {
  itemKey: 'associate',
  listKey: 'associates',
  title: 'Associate',
  roleName: 'Business Associate',
});
