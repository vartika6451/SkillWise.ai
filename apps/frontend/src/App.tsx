import "./index.css"
import { Form } from "./components/ui/Form";
import { Interview } from "./components/ui/Interview";
import { Toaster } from "sonner";
import { BrowserRouter, Routes, Route } from "react-router";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Form />} />
        <Route path="/interview/:id" element={<Interview />} />
      </Routes>
      <Toaster position="bottom-left"/>
    </BrowserRouter>
  );
}

export default App;

