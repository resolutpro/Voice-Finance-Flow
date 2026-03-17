import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db/schema";

const router = Router();

router.post("/bulk", async (req, res) => {
  try {
    const products = req.body; // Debería validar con Zod, pero lo simplificamos aquí

    if (!Array.isArray(products) || products.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "No products provided" });
    }

    // Inserción masiva en BD
    await db.insert(productsTable).values(products);

    res.status(201).json({ success: true, count: products.length });
  } catch (error) {
    console.error("Error bulk inserting products:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
