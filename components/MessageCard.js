import styles from '../styles/Home.module.css'
import { faBullhorn } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

export default function MessageCard(props) {
    return (
        <div className={styles.grid}>
            <div className={styles.card}>
                <p>Announcements <FontAwesomeIcon icon={faBullhorn} />
                <br/> 
                {props.message}</p>
            </div>
        </div>
    )
}