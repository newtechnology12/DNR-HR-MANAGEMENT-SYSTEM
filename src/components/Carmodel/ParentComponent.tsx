import React, { useState } from "react";
import { CarRequestForm } from "./CarRequestForm";


const ParentComponent = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsFormOpen(open);
  };

  const handleRequestCreated = (newRequest: any) => {
    console.log("New request created:", newRequest);
    setIsFormOpen(false);
  };

  return (
    <div>
      <button onClick={() => setIsFormOpen(true)}>Open Form</button>
      <CarRequestForm
        employees={[]}
        cars={[]}
        open={isFormOpen}
        onOpenChange={handleOpenChange}
        onRequestCreated={handleRequestCreated}
      />
    </div>
  );
};

export default ParentComponent;