import pocketbase from "@/lib/pocketbase";

/** Sign-in error with the server's reason: otp_required, invalid_otp, account_locked, inactive, invalid_credentials. */
export class SignInError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class AuthService {
  /** Password sign-in; `otp` is the 6-digit authenticator code (or a recovery code) when 2FA is on. */
  async signIn({ email, password, otp }: { email: string; password: string; otp?: string }) {
    try {
      const authData = await pocketbase
        .collection("users")
        .authWithPassword(email, password, {
          expand: "role,department,designation,branch",
          ...(otp ? { body: { identity: email, password, otp } } : {}),
        });

      return {
        names: authData?.record?.name,
        role: authData?.record?.expand?.role,
        email: authData?.record?.email,
        id: authData?.record?.id,
        photo: authData?.record?.avatar,
      };
    } catch (error) {
      const code = error?.response?.data?.code?.code || (error?.status === 0 ? "offline" : "invalid_credentials");
      const message =
        error?.status === 0
          ? "Cannot reach the server. Check your connection and try again."
          : error?.status === 400 && code === "invalid_credentials" && /failed to authenticate/i.test(error?.message || "")
            ? "Invalid e-mail or password."
            : error?.message || "Sign-in failed.";
      throw new SignInError(message, code, error?.status || 0);
    }
  }

  async getCurrentUser() {
    try {
      const user = await pocketbase.collection("users").authRefresh({
        expand: "role,department,designation,branch",
      });

      if (!user) return undefined;

      return {
        names: user.record?.name,
        role: user.record?.expand?.role,
        email: user.record?.email,
        id: user.record?.id,
        photo: pocketbase.files.getUrl(user.record, user.record?.avatar),
        phone: user.record?.phone,
        created_at: user.record?.created_at,
        status: user.record?.status,
        birth: user.record?.birth,
        gender: user.record?.gender,
        country: user.record?.country,
        national_id: user.record?.national_id,
        address: user.record?.address,
        salary: user.record?.salary,
        branch: user.record?.expand?.branch?.name,
        department: user.record?.expand?.department?.name,
        created: user.record?.created,
        joined_at: user.record?.joined_at,
        designation: user.record?.expand?.designation?.name,
      };
    } catch (error) {
      throw Error(error.message);
    }
  }

  /** Updates the signed-in user's own profile fields (the server blocks HR-controlled fields). */
  async updateProfile(profile: Record<string, unknown>) {
    const id = pocketbase.authStore.model?.id;
    if (!id) throw new Error("You are not signed in.");
    return pocketbase.collection("users").update(id, profile);
  }

  /**
   * Changes the signed-in user's password. PocketBase requires the current password and
   * invalidates existing sessions, so we sign in again with the new password afterwards.
   */
  async changePassword({ oldPassword, password, passwordConfirm }: { oldPassword: string; password: string; passwordConfirm: string }) {
    const model = pocketbase.authStore.model;
    if (!model?.id) throw new Error("You are not signed in.");
    await pocketbase.collection("users").update(model.id, { oldPassword, password, passwordConfirm });
    await pocketbase.collection("users").authWithPassword(model.email, password, { expand: "role,department,designation,branch" });
  }

  async forgotPassword({ email }) {
    try {
      const data = await pocketbase
        .collection("users")
        .requestPasswordReset(email);
      return data;
    } catch (error) {
      throw Error(error.message);
    }
  }

  async logout() {
    try {
      pocketbase.authStore.clear();
    } catch (error) {
      throw Error(error.message);
    }
  }
}

const authService = new AuthService();

export default authService;
