import styles from '../styles/Home.module.css'

export default function ResultsCard(props) {
    return (
        <div className={styles.grid}>
            <div className={styles.card}>
                <p><strong>{props.results.hits.length} results. 
                Showing you <strong>{props.results.hits.length < props.results.limit
                 ? props.results.hits.length : props.results.limit}. Search took </strong>({props.results.processingTimeMs} ms)</strong></p>
            </div>
        </div>
    )
}