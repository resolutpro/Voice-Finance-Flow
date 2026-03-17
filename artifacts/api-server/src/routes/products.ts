import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// GET - List products by company
router.get("/", async (req, res) => {
  try {
    const companyId = req.query.companyId;

    if (!companyId) {
      return res
        .status(400)
        .json({ success: false, error: "companyId is required" });
    }

    const products = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.companyId, Number(companyId)));

    res.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// DELETE - Delete a product
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!id) {
      return res
        .status(400)
        .json({ success: false, error: "Product ID is required" });
    }

    await db.delete(productsTable).where(eq(productsTable.id, Number(id)));

    res.json({ success: true, message: "Product deleted" });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /bulk - Bulk insert products
router.post("/bulk", async (req, res) => {
  try {
    const products = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "No products provided" });
    }

    // Validate and convert types
    const validatedProducts = products.map((p) => ({
      companyId: Number(p.companyId),
      name: String(p.name).trim(),
      price: Number(p.price) || 0,
      taxRate: Number(p.taxRate) || 0,
      active: p.active !== false,
    }));

    // Check for required fields
    const invalidProducts = validatedProducts.filter((p) => !p.name || p.companyId <= 0);
    if (invalidProducts.length > 0) {
      return res.status(400).json({
        success: false,
        error: `${invalidProducts.length} product(s) missing required fields (name and companyId)`,
      });
    }

    await db.insert(productsTable).values(validatedProducts);

    res
      .status(201)
      .json({ success: true, count: validatedProducts.length, message: "Products imported successfully" });
  } catch (error) {
    console.error("Error bulk inserting products:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

export default router;
