import org.jhotdraw.draw.DOMStorableInputOutputFormat;
import org.jhotdraw.draw.Drawing;
import org.jhotdraw.draw.Figure;
import org.jhotdraw.draw.QuadTreeDrawing;
import org.jhotdraw.samples.draw.DrawFigureFactory;

import java.io.File;
import java.util.HashMap;
import java.util.Map;

/** Loads an .xml through TerraER's own reader, then saves it again, exactly as the app does. */
public class LoadTest {
    public static void main(String[] args) throws Exception {
        DOMStorableInputOutputFormat fmt = new DOMStorableInputOutputFormat(new DrawFigureFactory());
        Drawing drawing = new QuadTreeDrawing();
        fmt.read(new File(args[0]), drawing);

        Map<String, Integer> byType = new HashMap<String, Integer>();
        for (Object o : drawing.getFigures()) {
            Figure f = (Figure) o;
            String n = f.getClass().getSimpleName();
            byType.put(n, byType.containsKey(n) ? byType.get(n) + 1 : 1);
        }
        System.out.println("READ OK: " + drawing.getFigureCount() + " figures " + byType);

        if (args.length > 1) {
            fmt.write(new File(args[1]), drawing);
            System.out.println("WRITE OK: " + args[1]);
        }
    }
}
