import { useState } from "react";
import AppFormAsyncSelect from "@/components/forms/AppFormAsyncSelect";
import { Button } from "@/components/ui/button";
import { useFormContext } from "react-hook-form";

function TeamMembersSelect({ form, loader }) {
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [currentMember, setCurrentMember] = useState(null);
  const { setValue } = useFormContext();

  const addMember = () => {
    if (currentMember) {
      const newMembers = [...selectedMembers, currentMember];
      setSelectedMembers(newMembers);
      setValue("team_members", newMembers.map(member => member.value));
      setCurrentMember(null);
    }
  };

  return (
    <div className="grid gap-2">
      <AppFormAsyncSelect
        form={form}
        label="Team Members"
        placeholder="Choose team members"
        name="current_member"
        loader={loader}
        onChange={setCurrentMember}
      />
      <Button type="button" onClick={addMember} className="h-8">
        Add Member
      </Button>
      <div>
        {selectedMembers.map((member, index) => (
          <div key={index} className="flex items-center gap-2">
            <span>{member.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TeamMembersSelect;