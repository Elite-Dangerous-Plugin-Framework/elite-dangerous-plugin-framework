import Theme from 'rspress/theme';
import { Card } from "rspress/theme";


const WIPWarning = ({ style }) => <Card style={style} title="Work in Progress" content={
    <p>EDPF is still being developed. There is <b>no</b> build available at this time.
        Pages may contain information that was not implemented yet.</p>
} />;
const Layout = () => <Theme.Layout beforeHero={<WIPWarning style={{ marginLeft: 20, marginRight: 20 }} />} beforeDocContent={<WIPWarning style={{ marginBottom: 20 }} />} />;

export default {
    ...Theme,
    Layout,
};

export * from 'rspress/theme';