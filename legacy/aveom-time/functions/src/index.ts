// Keep this first: it calls setGlobalOptions() before any function module below
// is evaluated, so the asia-south1 region applies to every function.
import "./options";

export {
  requestRegistration,
  approveRegistration,
  rejectRegistration,
  setEmployeeBlocked,
  grantProfileUnlock,
  correctEmployeeField,
} from "./auth-fns";

export { createProject, setProjectLocked, renameProject } from "./project-fns";
export { setRegistrationCode } from "./config-fns";
export { editShift, deleteShift } from "./shift-fns";
export { onEidUpload } from "./ocr";
export { generateReport } from "./reports";
export { purgeBlockedIds } from "./maintenance";
