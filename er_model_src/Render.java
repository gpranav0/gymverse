import org.jhotdraw.draw.DOMStorableInputOutputFormat;
import org.jhotdraw.draw.Drawing;
import org.jhotdraw.draw.Figure;
import org.jhotdraw.draw.QuadTreeDrawing;
import org.jhotdraw.samples.draw.DrawFigureFactory;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.io.File;

/** Renders a TerraER file to PNG so the layout can be eyeballed without opening the app. */
public class Render {
    public static void main(String[] args) throws Exception {
        DOMStorableInputOutputFormat fmt = new DOMStorableInputOutputFormat(new DrawFigureFactory());
        Drawing drawing = new QuadTreeDrawing();
        fmt.read(new File(args[0]), drawing);

        Rectangle2D.Double b = null;
        for (Object o : drawing.getFigures()) {
            Rectangle2D.Double fb = ((Figure) o).getDrawingArea();
            if (b == null) { b = fb; } else { b.add(fb); }
        }
        double scale = args.length > 2 ? Double.parseDouble(args[2]) : 1.0;
        if (args.length > 6) {
            b = new Rectangle2D.Double(Double.parseDouble(args[3]), Double.parseDouble(args[4]),
                                       Double.parseDouble(args[5]), Double.parseDouble(args[6]));
        }
        int pad = 40;
        int w = (int) Math.ceil((b.width + 2 * pad) * scale);
        int h = (int) Math.ceil((b.height + 2 * pad) * scale);
        System.out.println("drawing bounds: " + Math.round(b.width) + " x " + Math.round(b.height)
                + "  ->  png " + w + " x " + h);

        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, w, h);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.scale(scale, scale);
        g.translate(-b.x + pad, -b.y + pad);
        for (Object o : drawing.getFigures()) {
            ((Figure) o).draw(g);
        }
        g.dispose();
        ImageIO.write(img, "png", new File(args[1]));
        System.out.println("wrote " + args[1]);
    }
}
