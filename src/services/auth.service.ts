import pocketbase from "@/lib/pocketbase";

class AuthService {
  async signIn({ email, password }) {
    try {
      const authData = await pocketbase
        .collection("users")
        .authWithPassword(email, password);

      return {
        names: authData?.record?.name,
        role: authData?.record?.role,
        email: authData?.record?.email,
        id: authData?.record?.id,
        photo: authData?.record?.avatar,
      };
    } catch (error) {
      console.log(error);
      throw Error(error.message);
    }
  }

  async getCurrentUser() {
    try {
      const user = await pocketbase.collection("users").authRefresh({
        expand: "department,role,designation",
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
        branch: user.record?.branch,
        department: user.record?.expand?.department?.name,
        created: user.record?.created,
        joined_at: user.record?.joined_at,
        designation: user.record?.expand?.designation?.name,
      };
    } catch (error) {
      throw Error(error.message);
    }
  }

  async updateProfile(profile: any) {
    console.log(profile);
    // const { data, error } = await supabase.auth.updateUser({ ...profile });
    // if (error) return error;
    // return data;
  }

  async changePassword({ newPassword }) {
    console.log(newPassword);
    // const { data, error } = await supabase.auth.updateUser({
    //   password: newPassword,
    // });
    // if (error) return error;
    // return data;
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
      await await pocketbase.authStore.clear();
    } catch (error) {
      throw Error(error.message);
    }
  }
}

const authService = new AuthService();

export default authService;
